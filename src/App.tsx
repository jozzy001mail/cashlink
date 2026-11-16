import { useEffect, useMemo, useState } from 'react';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import WalletPanel, { type ConnectedWallet } from './components/WalletPanel.tsx';
import CreateInvoice from './components/CreateInvoice.tsx';
import PayInvoice from './components/PayInvoice.tsx';
import Invoices from './components/Invoices.tsx';
import { decodeInvoice, type Invoice } from './lib/invoice.ts';
import { fetchBchPriceUsd, EXPLORER_ADDR_URL } from './lib/bch.ts';
import { demoInvoice } from './lib/demo.ts';
import { loadPaid } from './lib/store.ts';

/** CashTokens address that can receive EMBER2026 tokens (Community Choice votes).
 *  Generated from a throwaway keypair whose private key was never stored. */
export const EMBER_ADDRESS = 'bitcoincash:qr27lumephpejzr575s46nmmxlzs5nlr3ywwdksu6u';

type Tab = 'create' | 'invoices' | 'about';

export default function App() {
  const [tab, setTab] = useState<Tab>('create');
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [manager, setManager] = useState<DappConnectionManager | null>(null);
  const [priceUsd, setPriceUsd] = useState<number | null>(null);
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [paidMap, setPaidMap] = useState<Record<string, string>>(loadPaid());
  const [linkError, setLinkError] = useState<string | null>(null);

  // Live BCH price, refreshed every minute.
  useEffect(() => {
    let stopped = false;
    const load = async () => {
      const p = await fetchBchPriceUsd();
      if (!stopped && p !== null) setPriceUsd(p);
    };
    void load();
    const timer = setInterval(() => void load(), 60_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, []);

  // Open an invoice from a share link (?invoice=...).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const encoded = params.get('invoice');
    if (!encoded) return;
    try {
      const inv = decodeInvoice(encoded);
      setPayInvoice(inv);
      setIsDemo(false);
    } catch (e) {
      setLinkError(e instanceof Error ? e.message : 'That invoice link is invalid.');
    }
  }, []);

  const paidTxid = useMemo(
    () => (payInvoice ? paidMap[payInvoice.id] ?? null : null),
    [payInvoice, paidMap],
  );

  function openDemo() {
    setPayInvoice(demoInvoice());
    setIsDemo(true);
    setLinkError(null);
  }

  function openPay(inv: Invoice) {
    setPayInvoice(inv);
    setIsDemo(false);
    setLinkError(null);
    window.scrollTo({ top: 0 });
  }

  function handlePaid(txid: string) {
    if (!payInvoice) return;
    setPaidMap((m) => ({ ...m, [payInvoice.id]: txid }));
  }

  function backToCreate() {
    setPayInvoice(null);
    setIsDemo(false);
    window.history.replaceState({}, '', window.location.pathname);
  }

  return (
    <div className="app">
      <header>
        <div className="brand">
          <span className="logo">₿</span>
          <div>
            <h1>CashLink</h1>
            <p className="tagline">Bitcoin Cash payment links for small businesses</p>
          </div>
        </div>
        <div className="price">
          {priceUsd !== null ? (
            <>1 BCH ≈ ${priceUsd.toLocaleString('en-US', { maximumFractionDigits: 2 })}</>
          ) : (
            'Price loading…'
          )}
        </div>
      </header>

      <WalletPanel onWallet={setWallet} onManager={setManager} />

      {linkError && <div className="error">{linkError}</div>}

      {payInvoice ? (
        <>
          <PayInvoice
            invoice={payInvoice}
            wallet={wallet}
            manager={manager}
            priceUsd={priceUsd}
            isDemo={isDemo}
            paidTxid={paidTxid}
            onPaid={handlePaid}
          />
          <button className="btn ghost" onClick={backToCreate}>
            ← Back to creating invoices
          </button>
        </>
      ) : (
        <>
          <nav className="tabs">
            <button className={tab === 'create' ? 'active' : ''} onClick={() => setTab('create')}>
              Create a link
            </button>
            <button className={tab === 'invoices' ? 'active' : ''} onClick={() => setTab('invoices')}>
              My invoices
            </button>
            <button className={tab === 'about' ? 'active' : ''} onClick={() => setTab('about')}>
              How it works
            </button>
            <button className="demo-tab" onClick={openDemo}>
              Try the demo →
            </button>
          </nav>

          {tab === 'create' && (
            <CreateInvoice wallet={wallet} priceUsd={priceUsd} onCreated={(inv) => openPay(inv)} />
          )}
          {tab === 'invoices' && <Invoices onOpen={openPay} />}
          {tab === 'about' && (
            <div className="card">
              <h2>How it works</h2>
              <ol className="steps">
                <li>
                  <strong>Merchant creates a link.</strong> Set an amount (USD or BCH), a label and your payout
                  address. CashLink gives you a share link and a QR code. No account, no custody, no fees from us.
                </li>
                <li>
                  <strong>Customer pays in BCH.</strong> They open the link and either connect a BCH wallet via
                  WizardConnect (Paytaca and other BCH wallets) — the wallet signs the transaction on Bitcoin Cash
                  mainnet — or scan the BIP21 QR code with any BCH wallet.
                </li>
                <li>
                  <strong>Payment is verified on-chain.</strong> CashLink watches the merchant address and marks the
                  invoice paid the moment the transaction confirms. The merchant can see it in any block explorer.
                </li>
              </ol>
              <h3>What CashLink is not</h3>
              <ul>
                <li>No custody: funds go straight from payer to merchant. We never hold BCH or keys.</li>
                <li>No account or KYC: invoices live in your browser's local storage.</li>
                <li>No promises: BCH is volatile, prices come from CoinGecko, and a payment is only real when it is on-chain.</li>
              </ul>
              <h3>Demo</h3>
              <p>
                “Try the demo” walks the whole flow with a 0.0001 BCH demo invoice and a clearly-labelled simulated
                payment — no wallet and no real BCH needed.
              </p>
              <h3>Built for BCH BLAZE 2026</h3>
              <p>
                Built during the hackathon (14–22 Nov 2026) with CashScript, WizardConnect and libauth. Source:{' '}
                <a href="https://github.com/jozzy001mail/cashlink" target="_blank" rel="noreferrer">
                  github.com/jozzy001mail/cashlink
                </a>
              </p>
            </div>
          )}
        </>
      )}

      <footer>
        <div>
          <strong>Community Choice:</strong> send EMBER2026 tokens to{' '}
          <a href={EXPLORER_ADDR_URL(EMBER_ADDRESS)} target="_blank" rel="noreferrer" className="mono">
            {EMBER_ADDRESS}
          </a>
        </div>
        <div className="muted small">
          CashLink is non-custodial. Verify every payment on-chain before handing over goods.
        </div>
      </footer>
    </div>
  );
}
