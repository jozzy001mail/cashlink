# CashLink — Bitcoin Cash payment links for small businesses

**BCH BLAZE 2026 entry (DoraHacks, 14–22 Nov 2026) · Mainnet Track**

A small shop should be able to take BCH without running a server, holding
customer funds, or learning how Bitcoin Cash works. CashLink is a
non-custodial payment-link app: a merchant creates a link (amount in USD or
BCH, a label, a payout address) and gets a shareable link + QR code. The
customer opens it and pays in BCH — either in-app with a **WizardConnect**
wallet (the wallet signs a real Bitcoin Cash **mainnet** transaction) or with
any BCH wallet via a BIP21 QR code. CashLink watches the merchant address
on-chain and marks the invoice paid the moment the transaction lands.

- **Live demo:** https://cashlink.vercel.app *(deploy in progress — see below)*
- **Presentation:** [`public/presentation/`](public/presentation/) (HTML slide deck, based on the BLAZE "Widget Factory" template)
- **Demo script:** [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)

## Why this, why now

Small businesses in Nigeria and across Africa lose sales to card fees,
chargebacks and slow settlement. BCH settles in seconds for a fraction of a
cent, but there is no dead-simple way for a market trader or café to accept
it: existing tools need accounts, custody, or a developer. CashLink is the
missing piece — a link, a QR code, and money straight to the merchant's own
address. No account, no KYC, no custody, no fees from us.

## How it works

1. **Merchant creates a link.** Amount (USD, converted at the live BCH
   price, or BCH directly), label, payout address. The payout address can be
   filled in from a connected wallet or pasted manually — no wallet is needed
   to create an invoice.
2. **Customer pays.** Two paths:
   - **In-app (WizardConnect):** connect a BCH wallet (Paytaca and other
     WizardConnect wallets), CashLink builds a P2PKH transaction with
     CashScript, the wallet signs it over the WizardConnect relay and
     broadcasts it. The app never sees a private key.
   - **Any wallet (BIP21):** scan the QR code with any BCH wallet; the page
     polls the chain and marks the invoice paid automatically.
3. **Verified on-chain.** Payment detection reads the merchant address via
   Electrum (CashScript provider) with a Blockchair REST fallback, and every
   paid invoice links to a block explorer.

Invoices live in the browser's local storage. There is no backend, no
database, no account.

## Tech

- React 19 + Vite + TypeScript
- [CashScript](https://cashscript.org) 0.14 — transaction building, Electrum provider
- [@wizardconnect/react](https://docs.riftenlabs.com/wizardconnect/react/) 0.2.7 — wallet connect + signing
- [@bitauth/libauth](https://libauth.org) — cashaddr, transaction encoding, txid derivation
- CoinGecko free API for the BCH/USD price (60s cache)

## Run it

```bash
npm install
npm run dev      # local dev server
npm test         # 11 tests (invoice logic, BIP21, amounts, local P2PKH sign + VM verify)
npm run build    # production build -> dist/
```

## What was verified (and what was not)

Verified in this repo, no network needed:

- `npm test` — **11/11 pass**, including a full local P2PKH transaction
  round-trip: build with CashScript, sign with a throwaway test key, verify
  the signature evaluates in the BCH VM (`builder.debug()`).
- `npm run build` — clean TypeScript + Vite production build.
- Invoice encode/decode, BIP21 build/parse, USD↔BCH↔sats math, fee
  estimation — all unit-tested.

Not verifiable from this machine (stated honestly):

- The **live WizardConnect sign flow** needs a real Paytaca (or other
  WizardConnect) wallet on a phone — none is available here, and this VM
  blocks outbound WebSocket connections, so the relay handshake could not be
  exercised end-to-end. The integration follows the official
  `@wizardconnect/react` + CashScript `generateWcTransactionObject()` docs
  exactly, and the unsigned transaction it hands to the wallet is the same
  shape the local test proves valid.
- **Electrum connectivity** from this VM is blocked (all tested wss
  endpoints fail here); the app runs in the judge's browser, where Electrum
  over WebSocket is the standard path, and a Blockchair REST fallback is
  built in for read-only lookups.

## Demo mode

"Try the demo" walks the whole flow with a 0.0001 BCH demo invoice and a
clearly-labelled **simulated** payment — no wallet and no real BCH needed.
See [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md).

## Community Choice

Send EMBER2026 tokens to `bitcoincash:qr27lumephpejzr575s46nmmxlzs5nlr3ywwdksu6u`
(a throwaway address generated for this project; its private key was never
stored).

## Hackathon requirements checklist

- [x] Original project built during the hackathon (14–22 Nov 2026)
- [x] At least one feature that sends BCH mainnet transactions (in-app
      WizardConnect payment + BIP21 external-wallet payment)
- [x] Live, usable demo (link above; demo mode needs no wallet)
- [x] WizardConnect integration (`@wizardconnect/react`, QR pairing)
- [x] Short presentation based on the BLAZE "Widget Factory" template
      ([`public/presentation/`](public/presentation/))
- [ ] Roll call at a preparation stream — missed; per the FAQ, late joiners
      can still compete but enter the low-priority queue
- [ ] Confirmation in the BCH BLAZE Telegram channel — needs the builder
      (Owoade) to post there

## Author

Built by Owoade (DoraHacks `@owoade`, GitHub
[jozzy001mail](https://github.com/jozzy001mail)) for BCH BLAZE 2026.
