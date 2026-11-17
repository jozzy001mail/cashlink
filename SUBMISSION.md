# CashLink — DoraHacks submission pack (BCH BLAZE 2026)

Everything below is ready to paste into the DoraHacks submission form for
https://dorahacks.io/hackathon/bchblaze2026. The project itself is built,
tested, deployed and public — the only step left is the form, which needs a
signed-in browser session as @owoade.

## Form fields

- **Project name:** CashLink
- **Tagline:** Bitcoin Cash payment links for small businesses
- **Track:** Mainnet Track
- **Team:** Owoade (solo) — DoraHacks @owoade, GitHub jozzy001mail
- **Live demo:** https://dorahacks-bchblaze-2026.vercel.app
- **GitHub repo (public):** https://github.com/jozzy001mail/cashlink
- **Presentation:** https://dorahacks-bchblaze-2026.vercel.app/presentation/
- **Demo script:** https://github.com/jozzy001mail/cashlink/blob/main/DEMO_SCRIPT.md
- **Community Choice (EMBER2026) address:** `bitcoincash:qr27lumephpejzr575s46nmmxlzs5nlr3ywwdksu6u`

## Short description (paste-ready)

CashLink is a non-custodial payment-link app for small businesses on Bitcoin
Cash mainnet. A merchant creates a link (amount in USD or BCH, a label, a
payout address) and gets a shareable link + QR code. The customer pays in BCH
— in-app with a WizardConnect wallet (the wallet signs a real BCH mainnet
transaction) or with any BCH wallet via a BIP21 QR code. CashLink watches the
merchant address on-chain and marks the invoice paid the moment the
transaction lands. No account, no KYC, no custody, no fees from us.

## What was built during the hackathon (14–22 Nov 2026)

- Full React + TypeScript app (Vite), built from scratch for BLAZE.
- WizardConnect integration (`@wizardconnect/react`): QR pairing, address
  derivation from the wallet xpub, sign-and-broadcast of a real BCH mainnet
  P2PKH transaction built with CashScript.
- BIP21 payment URIs + QR codes for any BCH wallet, with live on-chain
  payment detection (Electrum provider, Blockchair REST fallback).
- Live BCH/USD pricing (CoinGecko) so merchants can price in USD.
- Demo mode: full flow with a clearly-labelled simulated payment — no wallet
  and no real BCH needed.
- Presentation based on the BLAZE "Widget Factory" template.
- Tests: `npm test` — 11/11 pass, including a local P2PKH build + sign +
  BCH VM verification with a throwaway key.

## Requirements checklist

- [x] Original project built during the hackathon
- [x] Sends BCH mainnet transactions (WizardConnect in-app payment + BIP21)
- [x] Live, usable demo (link above; demo mode needs no wallet)
- [x] WizardConnect integration
- [x] Presentation based on the Widget Factory template
- [ ] Roll call at a preparation stream — missed; per the FAQ, late joiners
      can still compete but enter the low-priority queue
- [ ] Confirmation in the BCH BLAZE Telegram channel — Owoade to post

## Deadline

Submissions close **22 Nov 2026, 14:00 UTC**. Judging 23–27 Nov, winners
announced 28 Nov.
