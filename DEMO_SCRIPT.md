# CashLink — demo script (2 minutes)

For judges and anyone trying the live demo. No wallet and no real BCH needed
for the demo path; the real payment path is shown second.

## 0. Open the demo

Go to the live URL and click **"Try the demo →"**.

## 1. The demo invoice (30 seconds)

- You see a **demo invoice**: 0.0001 BCH for "Demo coffee — flat white",
  payable to a demo merchant address, with a **DEMO — no real BCH moves here**
  badge.
- Note the amount in BCH and its USD equivalent (live CoinGecko price).

## 2. The simulated payment (30 seconds)

- Click **"Simulate payment (demo only)"**.
- The invoice flips to **✅ Paid** with a clearly-labelled simulated
  transaction. Nothing touched the chain — this is the UI tour only.

## 3. Create a real invoice (45 seconds)

- Click **"← Back to creating invoices"**.
- Amount: $5 USD, label "Coffee — flat white", payout address: paste any
  `bitcoincash:` address (or connect a wallet to fill it in).
- Click **"Create payment link"** — you get a share link, a BIP21 payment
  URI and a QR code. Open the share link in a second tab: it loads the same
  invoice in the pay view.

## 4. The real payment path (what a judge with a BCH wallet does)

- On the pay view, click **"Connect BCH wallet"** and scan the
  WizardConnect QR code with Paytaca (or another WizardConnect wallet).
- The app derives your receive/change addresses from the wallet's xpub and
  shows your balance — your keys never leave the wallet.
- Click **"Pay 0.0001 BCH"** (or the invoice amount). CashLink builds a
  P2PKH transaction (CashScript), shows a preview — amount, ~fee in sats,
  change back to you — and asks the wallet to sign.
- Approve in your wallet. The wallet broadcasts; the page shows the txid
  with a block-explorer link, and the invoice is marked PAID.
- Without a wallet, the same invoice can be paid by scanning the BIP21 QR
  code with any BCH wallet — the page polls the chain and marks it paid
  automatically.

## 5. What to look at in the repo

- `src/lib/bch.ts` — `buildPaymentTx()`: the WizardConnect transaction
  builder (UTXO gathering, placeholder P2PKH unlocker, change output,
  fee at 2 sats/byte).
- `src/components/PayInvoice.tsx` — the two payment paths + live detection.
- `test/cashlink.test.ts` — 11 tests, including a local P2PKH build + sign +
  BCH VM verification with a throwaway key (`npm test`).
- `public/presentation/index.html` — the BLAZE pitch deck (live at `/presentation/`).

## Honest limits

- The live WizardConnect sign step needs a real BCH wallet on a phone; it
  follows the official docs exactly but could not be exercised end-to-end
  from this machine (no wallet here, VM blocks outbound WebSockets).
- Demo payments are simulated and labelled as such; only a real wallet
  payment moves real BCH.
