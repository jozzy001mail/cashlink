import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import {
  bip21Uri,
  formatBch,
  formatUsd,
  satsToUsd,
  isExpired,
  expiryLabel,
  type Invoice,
} from '../lib/invoice.ts';
import {
  buildPaymentTx,
  fetchPayerUtxos,
  findInvoicePayment,
  txidFromHex,
  EXPLORER_TX_URL,
  type BuiltPayment,
} from '../lib/bch.ts';
import { markPaid } from '../lib/store.ts';
import { simulateDemoPayment, DEMO_TXID } from '../lib/demo.ts';
import type { ConnectedWallet } from './WalletPanel.tsx';

type PayStage =
  | { stage: 'idle' }
  | { stage: 'building' }
  | { stage: 'preview'; built: BuiltPayment }
  | { stage: 'signing' }
  | { stage: 'error'; message: string };

/**
 * Payer view: pay an invoice.
 * Two real paths: (1) pay in-app with a WizardConnect wallet (the wallet
 * signs and broadcasts the BCH mainnet transaction), (2) pay with any BCH
 * wallet via the BIP21 QR code, with live on-chain detection. Demo invoices
 * offer a clearly-labelled simulated payment instead.
 */
export default function PayInvoice({
  invoice,
  wallet,
  manager,
  priceUsd,
  isDemo,
  paidTxid,
  onPaid,
}: {
  invoice: Invoice;
  wallet: ConnectedWallet | null;
  manager: DappConnectionManager | null;
  priceUsd: number | null;
  isDemo: boolean;
  paidTxid: string | null;
  onPaid: (txid: string) => void;
}) {
  const [pay, setPay] = useState<PayStage>({ stage: 'idle' });
  const [checking, setChecking] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [copied, setCopied] = useState(false);

  const expired = isExpired(invoice);
  const paid = paidTxid !== null;
  const bip21 = bip21Uri(invoice);

  // Live payment detection (external-wallet path): poll the merchant address.
  useEffect(() => {
    if (paid || isDemo || expired) return;
    let stopped = false;
    const seen = new Set<string>();
    const check = async () => {
      try {
        const txid = await findInvoicePayment({ merchantAddress: invoice.to, amountSats: invoice.amountSats, sinceTxids: seen });
        if (txid && !stopped) {
          markPaid(invoice.id, txid);
          onPaid(txid);
        }
      } catch {
        /* network hiccup — retry next poll */
      }
    };
    void check();
    const timer = setInterval(() => void check(), 15_000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.id, paid, isDemo, expired]);

  async function handleBuild() {
    if (!manager || !wallet) return;
    setPay({ stage: 'building' });
    try {
      const utxos = await fetchPayerUtxos(wallet.payerAddresses);
      if (utxos.length === 0) {
        throw new Error(
          `No BCH found on the first ${wallet.payerAddresses.length} scanned addresses of this wallet. ` +
            `Send a little BCH to ${wallet.receiveAddress} first, or pay with any wallet using the QR code below.`,
        );
      }
      const built = await buildPaymentTx({
        payerUtxos: utxos,
        changeAddress: wallet.changeAddress,
        merchantAddress: invoice.to,
        amountSats: invoice.amountSats,
      });
      setPay({ stage: 'preview', built });
    } catch (e) {
      setPay({ stage: 'error', message: e instanceof Error ? e.message : 'Could not build the payment.' });
    }
  }

  async function handleConfirmSign() {
    if (pay.stage !== 'preview' || !manager) return;
    setPay({ stage: 'signing' });
    try {
      const res = await manager.signTransaction({
        transaction: {
          transaction: pay.built.txHex,
          sourceOutputs: pay.built.sourceOutputs,
          broadcast: true,
          userPrompt: `Pay ${formatBch(invoice.amountSats)} BCH — ${invoice.label}`,
        },
        inputPaths: pay.built.inputPaths,
      });
      const txid = txidFromHex(res.signedTransaction);
      markPaid(invoice.id, txid);
      onPaid(txid);
      setPay({ stage: 'idle' });
    } catch (e) {
      setPay({
        stage: 'error',
        message: e instanceof Error ? e.message : 'The wallet did not sign the payment.',
      });
    }
  }

  async function handleSimulateDemo() {
    setSimulating(true);
    const txid = await simulateDemoPayment();
    markPaid(invoice.id, txid);
    onPaid(txid);
    setSimulating(false);
  }

  async function handleCheckNow() {
    setChecking(true);
    try {
      const txid = await findInvoicePayment({ merchantAddress: invoice.to, amountSats: invoice.amountSats });
      if (txid) {
        markPaid(invoice.id, txid);
        onPaid(txid);
      }
    } finally {
      setChecking(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="card">
      <h2>{isDemo ? 'Demo invoice' : 'Pay invoice'}</h2>
      {isDemo && <div className="demo-badge">DEMO — no real BCH moves here</div>}

      <div className="invoice-summary">
        <div className="big-amount">
          {formatBch(invoice.amountSats)} BCH
          {priceUsd !== null && <span className="muted"> ≈ {formatUsd(satsToUsd(invoice.amountSats, priceUsd))}</span>}
        </div>
        <div className="label">{invoice.label}</div>
        {invoice.memo && <div className="muted">{invoice.memo}</div>}
        <div className="small mono">To: {invoice.to}</div>
        <div className="small muted">
          Invoice <span className="mono">{invoice.id}</span> · {expiryLabel(invoice)}
        </div>
      </div>

      {paid ? (
        <div className="paid-box">
          <h3>✅ Paid</h3>
          {paidTxid === DEMO_TXID ? (
            <p className="small">
              Simulated demo payment — no real BCH moved. In a real payment this box shows the on-chain
              transaction.
            </p>
          ) : (
            <p>
              Transaction:{' '}
              <a href={EXPLORER_TX_URL(paidTxid!)} target="_blank" rel="noreferrer" className="mono">
                {paidTxid}
              </a>
            </p>
          )}
        </div>
      ) : expired ? (
        <div className="error">This invoice has expired.</div>
      ) : (
        <>
          <div className="pay-section">
            <h3>Pay with your BCH wallet (WizardConnect)</h3>
            {!wallet || !manager ? (
              <p className="muted">Connect your BCH wallet above to pay in-app. The wallet signs the transaction — CashLink never sees your keys.</p>
            ) : pay.stage === 'preview' ? (
              <div className="preview">
                <div>Pay <strong>{formatBch(invoice.amountSats)} BCH</strong> to the merchant</div>
                <div>Network fee: <strong>~{pay.built.feeSats} sats</strong> ({pay.built.inputsUsed} input{pay.built.inputsUsed > 1 ? 's' : ''})</div>
                {pay.built.changeSats > 0 && <div>Change back to you: {formatBch(pay.built.changeSats)} BCH</div>}
                <div className="btn-row">
                  <button className="btn primary" onClick={() => void handleConfirmSign()}>
                    Confirm & sign in wallet
                  </button>
                  <button className="btn ghost" onClick={() => setPay({ stage: 'idle' })}>
                    Cancel
                  </button>
                </div>
                <p className="small muted">Your wallet will show the exact transaction for approval before anything is signed.</p>
              </div>
            ) : pay.stage === 'signing' ? (
              <p>Waiting for your wallet to sign… approve the transaction in your wallet app.</p>
            ) : (
              <>
                <button className="btn primary big" onClick={() => void handleBuild()} disabled={pay.stage === 'building'}>
                  {pay.stage === 'building' ? 'Building transaction…' : `Pay ${formatBch(invoice.amountSats)} BCH`}
                </button>
                {pay.stage === 'error' && <div className="error">{pay.message}</div>}
              </>
            )}
          </div>

          <div className="pay-section">
            <h3>Or pay with any BCH wallet</h3>
            <div className="qr-wrap">
              <QRCodeSVG value={bip21} size={180} />
              <div className="small muted">Scan with Paytaca, Cashonize, Selene, Zapit or any BCH wallet.</div>
            </div>
            <div className="copy-row">
              <input type="text" readOnly value={invoice.to} onClick={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copy(invoice.to)}>
                {copied ? 'Copied!' : 'Copy address'}
              </button>
            </div>
            <p className="small muted">
              Send exactly <strong>{formatBch(invoice.amountSats)} BCH</strong> to the address above. This page
              watches the chain and marks the invoice paid automatically.
            </p>
            <button type="button" className="btn ghost" onClick={() => void handleCheckNow()} disabled={checking}>
              {checking ? 'Checking…' : 'Check now'}
            </button>
          </div>

          {isDemo && (
            <div className="pay-section">
              <h3>Demo shortcut</h3>
              <button type="button" className="btn" onClick={() => void handleSimulateDemo()} disabled={simulating}>
                {simulating ? 'Simulating…' : 'Simulate payment (demo only)'}
              </button>
              <p className="small muted">Skips the wallet and marks this demo invoice paid — no real BCH moves.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
