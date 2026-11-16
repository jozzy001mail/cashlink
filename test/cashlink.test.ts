// CashLink test suite — run with `npm test` (node --test, type stripping).
// Covers: invoice encode/decode round-trip, validation, BIP21 build/parse,
// amount math, fee estimation, and a full local P2PKH transaction round-trip
// (build with CashScript + sign with a throwaway test key + verify the
// signature evaluates in the BCH VM). No network, no wallet, no real funds.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInvoice,
  encodeInvoice,
  decodeInvoice,
  validateInvoice,
  bip21Uri,
  parseBip21,
  satsToBch,
  bchToSats,
  usdToSats,
  satsToUsd,
  formatBch,
  estimateTxBytes,
  estimateFeeSats,
  isExpired,
  MIN_INVOICE_SATS,
} from '../src/lib/invoice.ts';
import { pubkeyToCashaddr, txidFromHex } from '../src/lib/bch.ts';
import { demoInvoice, DEMO_TXID } from '../src/lib/demo.ts';

const MERCHANT = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';

test('invoice: create + encode + decode round-trip', () => {
  const inv = createInvoice({ to: MERCHANT, amountSats: 10_000, label: 'Coffee', memo: 'Thanks!' });
  assert.equal(validateInvoice(inv), null);
  const encoded = encodeInvoice(inv);
  assert.ok(!encoded.includes('+') && !encoded.includes('/') && !encoded.includes('='));
  const back = decodeInvoice(encoded);
  assert.deepEqual(back, inv);
});

test('invoice: validation rejects bad input', () => {
  assert.throws(() => createInvoice({ to: 'not-an-address', amountSats: 10_000, label: 'x' }));
  assert.throws(() => createInvoice({ to: MERCHANT, amountSats: 100, label: 'x' })); // below min
  assert.throws(() => createInvoice({ to: MERCHANT, amountSats: 10_000, label: '' }));
  assert.equal(validateInvoice({ v: 2, id: 'x' }), 'Unsupported invoice version');
  assert.equal(validateInvoice(null), 'Invoice is not an object');
});

test('invoice: decode rejects garbage', () => {
  assert.throws(() => decodeInvoice('!!!not-base64!!!'));
  assert.throws(() => decodeInvoice(Buffer.from('{"v":1}').toString('base64url')));
});

test('invoice: expiry', () => {
  const inv = createInvoice({ to: MERCHANT, amountSats: 10_000, label: 'x', expiresInSeconds: 60 });
  assert.equal(isExpired(inv), false);
  assert.equal(isExpired({ ...inv, expires: 1 }), true);
  const noExp = createInvoice({ to: MERCHANT, amountSats: 10_000, label: 'x' });
  assert.equal(isExpired(noExp), false);
});

test('bip21: build + parse round-trip', () => {
  const inv = createInvoice({ to: MERCHANT, amountSats: 25_000, label: 'Lunch', memo: 'Table 4' });
  const uri = bip21Uri(inv);
  assert.ok(uri.startsWith('bitcoincash:qp'));
  const parsed = parseBip21(uri);
  assert.ok(parsed);
  assert.equal(parsed.address, MERCHANT);
  assert.equal(parsed.amountSats, 25_000);
  assert.equal(parsed.label, 'Lunch');
  assert.equal(parsed.message, 'Table 4');
  assert.equal(parseBip21('bitcoin:1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa'), null);
  assert.equal(parseBip21('bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a?amount=abc'), null);
});

test('amounts: BCH/sats/USD math', () => {
  assert.equal(satsToBch(100_000_000), 1);
  assert.equal(bchToSats(0.0001), 10_000);
  assert.equal(bchToSats(1.5), 150_000_000);
  assert.equal(usdToSats(20.88, 208.8), 10_000_000);
  assert.equal(usdToSats(-5, 200), null);
  assert.equal(usdToSats(10, 0), null);
  assert.ok(Math.abs(satsToUsd(10_000_000, 208.8) - 20.88) < 1e-9);
  assert.equal(formatBch(10_000), '0.0001');
  assert.equal(formatBch(100_000_000), '1');
  assert.equal(formatBch(MIN_INVOICE_SATS), '0.00001');
});

test('fees: estimate grows with inputs/outputs', () => {
  const one = estimateFeeSats(1, 2);
  const three = estimateFeeSats(3, 2);
  assert.ok(one > 0 && one < 1000);
  assert.ok(three > one);
  assert.equal(estimateTxBytes(1, 2), 10 + 148 + 68);
});

test('demo invoice is valid and clearly labelled', () => {
  const inv = demoInvoice();
  assert.equal(validateInvoice(inv), null);
  assert.equal(inv.amountSats, 10_000);
  assert.ok(inv.memo?.includes('demo'));
  assert.ok(DEMO_TXID.startsWith('demo-'));
});

test('bch: pubkey -> cashaddr is deterministic and well-formed', async () => {
  const { secp256k1 } = await import('@bitauth/libauth');
  // Fixed test key (throwaway, test-only — never a real wallet).
  const priv = new Uint8Array(32).fill(7);
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  assert.ok(pub instanceof Uint8Array && pub.length === 33);
  const addr = pubkeyToCashaddr(pub);
  assert.ok(addr.startsWith('bitcoincash:q'));
  assert.equal(pubkeyToCashaddr(pub), addr);
});

test('bch: txid derivation is stable and 32 bytes reversed', () => {
  // All-zero 250-byte tx -> deterministic double-sha256 txid.
  const hex = '00'.repeat(250);
  const txid = txidFromHex(hex);
  assert.match(txid, /^[0-9a-f]{64}$/);
  assert.equal(txidFromHex(hex), txid);
});

test('tx: local P2PKH build + sign + VM-verify with a throwaway key', async () => {
  const cashscript = await import('cashscript');
  const libauth = await import('@bitauth/libauth');
  const { TransactionBuilder, SignatureTemplate, MockNetworkProvider, Network } = cashscript;
  const { secp256k1, cashAddressToLockingBytecode, binToHex, hexToBin, decodeTransaction } = libauth;

  const priv = new Uint8Array(32).fill(11); // throwaway test key only
  const pub = secp256k1.derivePublicKeyCompressed(priv);
  const senderAddr = pubkeyToCashaddr(pub);
  const lockingBytecode = binToHex(cashAddressToLockingBytecode(senderAddr).bytecode);

  // Fake confirmed UTXO owned by the test key.
  const utxo = {
    txid: 'a'.repeat(64),
    vout: 0,
    satoshis: 100_000n,
    lockingBytecode,
  };

  const provider = new MockNetworkProvider();
  provider.network = Network.MAINNET; // mock defaults to mocknet (bchtest prefix)
  const template = new SignatureTemplate(priv);
  const builder = new TransactionBuilder({ provider });
  builder.addInput(utxo, template.unlockP2PKH());
  builder.addOutput({ to: MERCHANT, amount: 50_000n });
  builder.addBchChangeOutputIfNeeded({ to: senderAddr, feeRate: 2 });

  // build() signs locally and returns the signed tx hex.
  const txHex = builder.build();
  assert.match(txHex, /^[0-9a-f]+$/);
  const tx = decodeTransaction(hexToBin(txHex));
  assert.equal(tx.inputs.length, 1);
  assert.equal(tx.outputs.length, 2); // payment + change
  assert.equal(tx.outputs[0].valueSatoshis, 50_000n);
  // Change = 100000 - 50000 - fee; fee must be small and positive.
  const fee = 100_000n - tx.outputs[0].valueSatoshis - tx.outputs[1].valueSatoshis;
  assert.ok(fee > 0n && fee < 1000n, `fee ${fee} out of range`);

  // The VM debug run proves the signature is valid for the locking script.
  const debug = await builder.debug();
  assert.ok(debug, 'debug trace missing');
});
