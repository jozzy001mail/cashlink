// CashLink — on-chain layer (Bitcoin Cash mainnet).
// All chain access goes through CashScript's ElectrumNetworkProvider, with a
// public Blockchair REST fallback for read-only lookups (UTXOs / history).
// The app NEVER holds a private key: the payer's wallet signs via
// WizardConnect and the wallet itself broadcasts (or returns the signed tx).

import {
  ElectrumNetworkProvider,
  Network,
  TransactionBuilder,
  placeholderP2PKHUnlocker,
  gatherBchUtxos,
  type SpendableUtxo,
} from 'cashscript';
import {
  encodeTransaction,
  decodeTransaction,
  hash160,
  encodeCashAddress,
  cashAddressToLockingBytecode,
  hexToBin,
  binToHex,
  sha256,
} from '@bitauth/libauth';
import { FEE_RATE_SATS_PER_BYTE, estimateTxBytes, normaliseCashaddr } from './invoice.ts';

export const EXPLORER_TX_URL = (txid: string) => `https://blockchair.com/bitcoin-cash/transaction/${txid}`;
export const EXPLORER_ADDR_URL = (addr: string) => `https://blockchair.com/bitcoin-cash/address/${addr}`;

const PRICE_URL = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin-cash&vs_currencies=usd';
const PRICE_CACHE_KEY = 'cashlink-bch-price';
const PRICE_CACHE_TTL_MS = 60_000;

let cachedProvider: ElectrumNetworkProvider | null = null;

/** Shared Electrum provider (CashScript manages its own server list + failover). */
export function getProvider(): ElectrumNetworkProvider {
  if (!cachedProvider) cachedProvider = new ElectrumNetworkProvider(Network.MAINNET);
  return cachedProvider;
}

/** Live BCH/USD price from CoinGecko, with a 60s cache and a localStorage fallback. */
export async function fetchBchPriceUsd(): Promise<number | null> {
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { price: number; at: number };
      if (Date.now() - cached.at < PRICE_CACHE_TTL_MS && cached.price > 0) return cached.price;
    }
  } catch {
    /* ignore */
  }
  try {
    const res = await fetch(PRICE_URL);
    if (!res.ok) throw new Error(`price HTTP ${res.status}`);
    const data = (await res.json()) as { 'bitcoin-cash'?: { usd?: number } };
    const price = data['bitcoin-cash']?.usd;
    if (typeof price === 'number' && price > 0) {
      try {
        localStorage.setItem(PRICE_CACHE_KEY, JSON.stringify({ price, at: Date.now() }));
      } catch {
        /* ignore */
      }
      return price;
    }
  } catch {
    /* fall through to the stale cache */
  }
  try {
    const raw = localStorage.getItem(PRICE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw) as { price: number; at: number };
      if (cached.price > 0) return cached.price;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Compressed pubkey (33 bytes) -> bitcoincash: P2PKH cashaddr. */
export function pubkeyToCashaddr(pubkey: Uint8Array): string {
  const hash = hash160(pubkey);
  const result = encodeCashAddress({ payload: hash, prefix: 'bitcoincash', type: 'p2pkh' });
  if (typeof result === 'string') throw new Error(`Address encoding failed: ${result}`);
  return result.address;
}

/** Validate a cashaddr and return its locking bytecode (hex). Throws on bad input. */
export function cashaddrToLockingBytecodeHex(addr: string): string {
  const result = cashAddressToLockingBytecode(normaliseCashaddr(addr));
  if (typeof result === 'string') throw new Error(`Invalid cashaddr: ${addr}`);
  return binToHex(result.bytecode);
}

export interface PayerUtxo extends SpendableUtxo {
  /** HD path name in the wallet: "receive" or "change". */
  pathName: 'receive' | 'change';
  /** Address index on that path. */
  pathIndex: number;
  /** The cashaddr the UTXO belongs to. */
  ownerAddress: string;
}

export interface PayerAddress {
  cashaddr: string;
  pathName: 'receive' | 'change';
  pathIndex: number;
}

/**
 * Fetch spendable UTXOs for a list of payer addresses (Electrum first,
 * Blockchair REST fallback). Returns UTXOs tagged with their HD path so the
 * sign request can carry the right inputPaths.
 */
export async function fetchPayerUtxos(addresses: PayerAddress[]): Promise<PayerUtxo[]> {
  const out: PayerUtxo[] = [];
  const provider = getProvider();
  for (const addr of addresses) {
    let utxos: SpendableUtxo[] = [];
    try {
      utxos = await provider.getUtxos(addr.cashaddr);
    } catch {
      utxos = await fetchUtxosBlockchair(addr.cashaddr);
    }
    for (const u of utxos) {
      out.push({ ...u, pathName: addr.pathName, pathIndex: addr.pathIndex, ownerAddress: addr.cashaddr });
    }
  }
  return out;
}

/** Blockchair REST fallback for UTXOs (read-only, no key needed). */
export async function fetchUtxosBlockchair(cashaddr: string): Promise<SpendableUtxo[]> {
  const url = `https://api.blockchair.com/bitcoin-cash/dashboards/address/${encodeURIComponent(cashaddr)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Blockchair HTTP ${res.status}`);
  const data = (await res.json()) as {
    data?: Record<string, { utxo?: Array<{ transaction_hash: string; index: number; value: number }> }>;
  };
  const entry = data.data?.[cashaddr] ?? data.data?.[Object.keys(data.data ?? {})[0] ?? ''];
  const utxos = entry?.utxo ?? [];
  return utxos.map((u) => {
    const lockingBytecode = cashaddrToLockingBytecodeHex(cashaddr);
    return {
      txid: u.transaction_hash,
      vout: u.index,
      satoshis: BigInt(u.value),
      lockingBytecode,
    } satisfies SpendableUtxo;
  });
}

/** Total confirmed balance (sats) across a set of UTXOs. */
export function sumUtxos(utxos: Pick<SpendableUtxo, 'satoshis'>[]): bigint {
  return utxos.reduce((sum, u) => sum + u.satoshis, 0n);
}

export interface BuiltPayment {
  /** Unsigned transaction hex (placeholder signatures) to hand to the wallet. */
  txHex: string;
  /** Source outputs for the WalletConnect / WizardConnect sign request. */
  sourceOutputs: ReturnType<TransactionBuilder['generateWcTransactionObject']>['sourceOutputs'];
  /** HD paths for each input: [inputIndex, pathName, addressIndex]. */
  inputPaths: Array<[number, string, number]>;
  /** Fee in satoshis the wallet will pay. */
  feeSats: number;
  /** Number of inputs used. */
  inputsUsed: number;
  /** Change returned to the payer (sats, 0 if absorbed into the fee). */
  changeSats: number;
}

/**
 * Build an unsigned P2PKH payment for a WizardConnect wallet to sign.
 * The payer's UTXOs are gathered from their receive/change addresses; the
 * transaction pays `amountSats` to the merchant and returns change to the
 * payer's change address. The result is a WalletConnect-style transaction
 * object: the wallet signs it (and broadcasts when asked) — the app never
 * sees a private key.
 */
export async function buildPaymentTx(opts: {
  payerUtxos: PayerUtxo[];
  changeAddress: string;
  merchantAddress: string;
  amountSats: number;
}): Promise<BuiltPayment> {
  const { payerUtxos, changeAddress, merchantAddress, amountSats } = opts;
  const amount = BigInt(amountSats);
  if (amount <= 0n) throw new Error('Amount must be positive');
  if (payerUtxos.length === 0) throw new Error('No spendable UTXOs found for this wallet');

  // Rough fee for a 1-in/2-out tx, then gather enough UTXOs to cover amount + fee.
  const roughFee = BigInt(estimateTxBytes(1, 2) * FEE_RATE_SATS_PER_BYTE);
  const gathered = gatherBchUtxos(payerUtxos, amount + roughFee);
  if (gathered.utxos.length === 0) {
    throw new Error(
      `Insufficient funds: need ${amount + roughFee} sats (payment + ~${roughFee} fee), ` +
        `wallet holds ${sumUtxos(payerUtxos)} sats on the scanned addresses.`,
    );
  }
  const selected = gathered.utxos as PayerUtxo[];

  const provider = getProvider();
  const builder = new TransactionBuilder({ provider, maximumFeeSatsPerByte: 10 });
  for (const utxo of selected) {
    builder.addInput(utxo, placeholderP2PKHUnlocker(utxo.ownerAddress));
  }
  builder.addOutput({ to: normaliseCashaddr(merchantAddress), amount });
  builder.addBchChangeOutputIfNeeded({ to: normaliseCashaddr(changeAddress), feeRate: FEE_RATE_SATS_PER_BYTE });

  const wc = builder.generateWcTransactionObject({
    broadcast: true,
    userPrompt: `Pay ${amountSats} sats with CashLink`,
  });

  // Serialise the unsigned transaction for the wallet.
  const txHex = typeof wc.transaction === 'string' ? wc.transaction : binToHex(encodeTransaction(wc.transaction));
  const inputPaths: Array<[number, string, number]> = selected.map((u, i) => [i, u.pathName, u.pathIndex]);

  // Fee = inputs - outputs (change output already accounted for in the tx).
  const decoded = decodeTransaction(hexToBin(txHex));
  if (typeof decoded === 'string') throw new Error(`Could not decode the built transaction: ${decoded}`);
  const inTotal = selected.reduce((s, u) => s + u.satoshis, 0n);
  const outTotal = decoded.outputs.reduce((s, o) => s + o.valueSatoshis, 0n);
  const feeSats = Number(inTotal - outTotal);
  const changeSats = Number(outTotal - amount);

  return {
    txHex,
    sourceOutputs: wc.sourceOutputs,
    inputPaths,
    feeSats,
    inputsUsed: selected.length,
    changeSats,
  };
}

/** Derive a txid from signed transaction hex (double-SHA256, reversed). */
export function txidFromHex(signedTxHex: string): string {
  const bytes = hexToBin(signedTxHex);
  const first = sha256.hash(bytes);
  const second = sha256.hash(first);
  return binToHex(second.reverse());
}

export interface AddressHistoryItem {
  txid: string;
  height: number;
}

/** Recent on-chain history for an address (Electrum first, Blockchair fallback). */
export async function fetchAddressHistory(cashaddr: string): Promise<AddressHistoryItem[]> {
  const provider = getProvider();
  try {
    const res = await provider.performRequest('blockchain.address.get_history', cashaddr);
    const list = (res as unknown as Array<{ tx_hash: string; height: number }>) ?? [];
    return list.map((h) => ({ txid: h.tx_hash, height: h.height }));
  } catch {
    const url = `https://api.blockchair.com/bitcoin-cash/dashboards/address/${encodeURIComponent(cashaddr)}?limit=10`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Blockchair HTTP ${r.status}`);
    const data = (await r.json()) as {
      data?: Record<string, { transactions?: string[] }>;
    };
    const entry = data.data?.[cashaddr] ?? data.data?.[Object.keys(data.data ?? {})[0] ?? ''];
    return (entry?.transactions ?? []).map((txid) => ({ txid, height: -1 }));
  }
}

/**
 * Check whether an invoice has been paid: look for a confirmed-or-mempool
 * transaction sending at least `amountSats` to the merchant address.
 * Returns the matching txid, or null.
 */
export async function findInvoicePayment(opts: {
  merchantAddress: string;
  amountSats: number;
  sinceTxids?: Set<string>;
}): Promise<string | null> {
  const { merchantAddress, amountSats } = opts;
  const history = await fetchAddressHistory(merchantAddress);
  const seen = opts.sinceTxids ?? new Set<string>();
  for (const item of history) {
    if (seen.has(item.txid)) continue;
    try {
      const raw = await getProvider().getRawTransaction(item.txid);
      const tx = decodeTransaction(hexToBin(raw));
      if (typeof tx === 'string') continue;
      const lockingBytecode = cashaddrToLockingBytecodeHex(merchantAddress);
      const paid = tx.outputs.some(
        (o) => binToHex(o.lockingBytecode) === lockingBytecode && o.valueSatoshis >= BigInt(amountSats),
      );
      if (paid) return item.txid;
    } catch {
      // Fall through to the Blockchair amount check below.
      try {
        const url = `https://api.blockchair.com/bitcoin-cash/dashboards/transaction/${item.txid}`;
        const r = await fetch(url);
        if (r.ok) {
          const d = (await r.json()) as {
            data?: Record<string, { outputs?: Array<{ recipient?: string; value?: number }> }>;
          };
          const entry = d.data?.[item.txid];
          const hit = entry?.outputs?.some(
            (o) => o.recipient === normaliseCashaddr(merchantAddress) && (o.value ?? 0) >= amountSats,
          );
          if (hit) return item.txid;
        }
      } catch {
        /* ignore */
      }
    }
  }
  return null;
}
