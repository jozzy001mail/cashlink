// CashLink — demo mode.
// The demo lets a judge walk the full create -> share -> pay flow with NO
// real BCH and NO wallet. The simulated payment is clearly labelled DEMO at
// every step; nothing here touches the chain.

import { createInvoice, type Invoice } from './invoice.ts';

/** Fixed demo merchant address (a valid cashaddr; no key is held by CashLink). */
export const DEMO_MERCHANT_ADDRESS = 'bitcoincash:qpm2qsznhks23z7629mms6s4cwef74vcwvy22gdx6a';

/** A demo invoice: 0.0001 BCH for "Demo coffee". Re-created fresh each load. */
export function demoInvoice(): Invoice {
  return createInvoice({
    to: DEMO_MERCHANT_ADDRESS,
    amountSats: 10_000,
    label: 'Demo coffee — flat white',
    memo: 'CashLink demo invoice. No real BCH moves in demo mode.',
    expiresInSeconds: 3600,
  });
}

/** Fake txid used by the simulated demo payment (clearly not a real txid). */
export const DEMO_TXID = 'demo-simulated-payment-no-real-bch-moved';

/** Simulate a demo payment after a short delay, so the UI can show the paid state. */
export function simulateDemoPayment(ms = 1500): Promise<string> {
  return new Promise((resolve) => setTimeout(() => resolve(DEMO_TXID), ms));
}
