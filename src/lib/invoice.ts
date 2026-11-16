// CashLink — pure invoice logic (no wallet / network dependencies).
// An invoice is a small JSON object, base64url-encoded into a share link.
// The merchant's payout address is a plain BCH cashaddr; CashLink never
// holds keys, never custodies funds, and never touches a private key.

export interface Invoice {
  /** Schema version. */
  v: 1;
  /** Random invoice id (16 hex chars). */
  id: string;
  /** Merchant payout address (bitcoincash: cashaddr). */
  to: string;
  /** Amount in satoshis. */
  amountSats: number;
  /** Short label, e.g. "Coffee — flat white". */
  label: string;
  /** Optional free-text note for the payer. */
  memo?: string;
  /** Unix seconds when the invoice was created. */
  created: number;
  /** Optional expiry in unix seconds. 0 = no expiry. */
  expires?: number;
}

export const DUST_SATS = 546;
export const MIN_INVOICE_SATS = 1_000; // 0.00001 BCH — safely above dust + fee
export const MAX_INVOICE_SATS = 100_000_000_000; // 1,000 BCH sanity cap
export const SATS_PER_BCH = 100_000_000;

/** Fee rate used when building a payment (sats per byte). BCH standard is 1; we use 2 for fast relay. */
export const FEE_RATE_SATS_PER_BYTE = 2;

/** Rough size of a 1-input, 2-output P2PKH tx (bytes). Used for fee estimates. */
export function estimateTxBytes(inputs: number, outputs: number): number {
  return 10 + inputs * 148 + outputs * 34;
}

export function estimateFeeSats(inputs: number, outputs: number): number {
  return estimateTxBytes(inputs, outputs) * FEE_RATE_SATS_PER_BYTE;
}

/** satoshis -> BCH (number, up to 8 decimals). */
export function satsToBch(sats: number): number {
  return sats / SATS_PER_BCH;
}

/** BCH -> satoshis (integer, rounds to nearest sat). */
export function bchToSats(bch: number): number {
  return Math.round(bch * SATS_PER_BCH);
}

/** USD amount -> satoshis at a given BCH/USD price. Returns null on bad input. */
export function usdToSats(usd: number, bchPriceUsd: number): number | null {
  if (!Number.isFinite(usd) || !Number.isFinite(bchPriceUsd) || usd <= 0 || bchPriceUsd <= 0) return null;
  return Math.round((usd / bchPriceUsd) * SATS_PER_BCH);
}

/** satoshis -> USD at a given BCH/USD price. */
export function satsToUsd(sats: number, bchPriceUsd: number): number {
  return (sats / SATS_PER_BCH) * bchPriceUsd;
}

/** Format satoshis as a BCH string with up to 8 decimals, trimmed. */
export function formatBch(sats: number): string {
  return (sats / SATS_PER_BCH).toFixed(8).replace(/\.?0+$/, '');
}

/** Format a USD value with 2 decimals. */
export function formatUsd(usd: number): string {
  return usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const CASHADDR_RE = /^(bitcoincash:)?[qp][a-z0-9]{41}$/i;

/** Loose cashaddr shape check (full checksum validation happens in libauth at build time). */
export function isCashaddrShape(addr: string): boolean {
  return CASHADDR_RE.test(addr.trim());
}

/** Normalise an address to the `bitcoincash:...` form. */
export function normaliseCashaddr(addr: string): string {
  const a = addr.trim();
  return a.startsWith('bitcoincash:') ? a : `bitcoincash:${a}`;
}

/** Validate an invoice object. Returns an error string, or null if valid. */
export function validateInvoice(inv: unknown): string | null {
  if (typeof inv !== 'object' || inv === null) return 'Invoice is not an object';
  const o = inv as Record<string, unknown>;
  if (o.v !== 1) return 'Unsupported invoice version';
  if (typeof o.id !== 'string' || !/^[0-9a-f]{16}$/.test(o.id)) return 'Bad invoice id';
  if (typeof o.to !== 'string' || !isCashaddrShape(o.to)) return 'Bad payout address';
  if (typeof o.amountSats !== 'number' || !Number.isInteger(o.amountSats)) return 'Bad amount';
  if (o.amountSats < MIN_INVOICE_SATS) return `Amount below minimum (${formatBch(MIN_INVOICE_SATS)} BCH)`;
  if (o.amountSats > MAX_INVOICE_SATS) return 'Amount above maximum';
  if (typeof o.label !== 'string' || o.label.length === 0 || o.label.length > 120) return 'Bad label';
  if (o.memo !== undefined && (typeof o.memo !== 'string' || o.memo.length > 500)) return 'Bad memo';
  if (typeof o.created !== 'number' || o.created <= 0) return 'Bad creation time';
  if (o.expires !== undefined && (typeof o.expires !== 'number' || o.expires < 0)) return 'Bad expiry';
  return null;
}

/** Create a new invoice. Throws on bad input. */
export function createInvoice(opts: {
  to: string;
  amountSats: number;
  label: string;
  memo?: string;
  expiresInSeconds?: number;
}): Invoice {
  const to = normaliseCashaddr(opts.to);
  const inv: Invoice = {
    v: 1,
    id: randomId(),
    to,
    amountSats: Math.floor(opts.amountSats),
    label: opts.label.trim(),
    created: Math.floor(Date.now() / 1000),
  };
  if (opts.memo?.trim()) inv.memo = opts.memo.trim();
  if (opts.expiresInSeconds && opts.expiresInSeconds > 0) {
    inv.expires = inv.created + Math.floor(opts.expiresInSeconds);
  }
  const err = validateInvoice(inv);
  if (err) throw new Error(`Invalid invoice: ${err}`);
  return inv;
}

export function randomId(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Encode an invoice into a URL-safe string for the share link. */
export function encodeInvoice(inv: Invoice): string {
  const json = JSON.stringify(inv);
  const b64 = btoa(unescape(encodeURIComponent(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode an invoice from a share-link string. Throws on bad input. */
export function decodeInvoice(encoded: string): Invoice {
  let b64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4 !== 0) b64 += '=';
  let json: string;
  try {
    json = decodeURIComponent(escape(atob(b64)));
  } catch {
    throw new Error('Invoice link is not valid base64');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('Invoice link is not valid JSON');
  }
  const err = validateInvoice(parsed);
  if (err) throw new Error(`Invalid invoice: ${err}`);
  return parsed as Invoice;
}

/** Build the share URL for an invoice (same origin, ?invoice=...). */
export function invoiceShareUrl(inv: Invoice, origin: string): string {
  return `${origin}/?invoice=${encodeInvoice(inv)}`;
}

/** Build a BIP21 payment URI: bitcoincash:<addr>?amount=<bch>&label=<label>&message=<memo> */
export function bip21Uri(inv: Invoice): string {
  const params = new URLSearchParams();
  params.set('amount', satsToBch(inv.amountSats).toFixed(8).replace(/\.?0+$/, ''));
  if (inv.label) params.set('label', inv.label);
  if (inv.memo) params.set('message', inv.memo);
  return `${inv.to}?${params.toString()}`;
}

/** Parse a BIP21 URI back into its parts. Returns null if not a BCH BIP21 URI. */
export function parseBip21(uri: string): { address: string; amountSats: number | null; label: string | null; message: string | null } | null {
  const m = uri.match(/^bitcoincash:([qp][a-z0-9]{41})(?:\?(.*))?$/i);
  if (!m) return null;
  const params = new URLSearchParams(m[2] ?? '');
  const amount = params.get('amount');
  let amountSats: number | null = null;
  if (amount !== null) {
    const bch = Number(amount);
    if (!Number.isFinite(bch) || bch <= 0) return null;
    amountSats = bchToSats(bch);
  }
  return {
    address: `bitcoincash:${m[1].toLowerCase()}`,
    amountSats,
    label: params.get('label'),
    message: params.get('message'),
  };
}

/** Is this invoice expired right now? */
export function isExpired(inv: Invoice, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return !!inv.expires && inv.expires > 0 && nowSeconds > inv.expires;
}

/** Human-readable countdown / expiry label. */
export function expiryLabel(inv: Invoice): string {
  if (!inv.expires) return 'No expiry';
  const left = inv.expires - Math.floor(Date.now() / 1000);
  if (left <= 0) return 'Expired';
  if (left < 3600) return `Expires in ${Math.ceil(left / 60)} min`;
  if (left < 86400) return `Expires in ${Math.round(left / 3600)} h`;
  return `Expires in ${Math.round(left / 86400)} days`;
}
