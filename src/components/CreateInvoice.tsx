import { useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import {
  createInvoice,
  invoiceShareUrl,
  bip21Uri,
  bchToSats,
  usdToSats,
  formatBch,
  formatUsd,
  satsToUsd,
  isCashaddrShape,
  MIN_INVOICE_SATS,
  type Invoice,
} from '../lib/invoice.ts';
import { saveInvoice } from '../lib/store.ts';
import type { ConnectedWallet } from './WalletPanel.tsx';

/**
 * Merchant view: build a payment link.
 * The payout address can come from the connected wallet (one click) or be
 * typed in manually — no wallet is required to create an invoice.
 */
export default function CreateInvoice({
  wallet,
  priceUsd,
  onCreated,
}: {
  wallet: ConnectedWallet | null;
  priceUsd: number | null;
  onCreated: (inv: Invoice) => void;
}) {
  const [amountMode, setAmountMode] = useState<'bch' | 'usd'>('usd');
  const [amount, setAmount] = useState('5');
  const [label, setLabel] = useState('');
  const [memo, setMemo] = useState('');
  const [to, setTo] = useState('');
  const [expiryHours, setExpiryHours] = useState('24');
  const [created, setCreated] = useState<Invoice | null>(null);
  const [error, setError] = useState<string | null>(null);

  const payoutAddress = wallet?.receiveAddress ?? to.trim();
  const amountSats = useMemo(() => {
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) return null;
    if (amountMode === 'bch') return bchToSats(n);
    if (priceUsd === null) return null;
    return usdToSats(n, priceUsd);
  }, [amount, amountMode, priceUsd]);

  const shareUrl = created ? invoiceShareUrl(created, window.location.origin) : '';
  const bip21 = created ? bip21Uri(created) : '';

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!payoutAddress || !isCashaddrShape(payoutAddress)) {
      setError('Enter a valid bitcoincash: payout address, or connect your wallet to fill it in.');
      return;
    }
    if (amountSats === null) {
      setError(amountMode === 'usd' && priceUsd === null ? 'Price feed is loading — try the BCH amount instead.' : 'Enter a valid amount.');
      return;
    }
    if (amountSats < MIN_INVOICE_SATS) {
      setError(`Amount is below the minimum (${formatBch(MIN_INVOICE_SATS)} BCH).`);
      return;
    }
    if (!label.trim()) {
      setError('Give the invoice a label (what is it for?).');
      return;
    }
    try {
      const inv = createInvoice({
        to: payoutAddress,
        amountSats,
        label,
        memo: memo || undefined,
        expiresInSeconds: Number(expiryHours) > 0 ? Number(expiryHours) * 3600 : undefined,
      });
      saveInvoice(inv);
      setCreated(inv);
      onCreated(inv);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create the invoice.');
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
  }

  return (
    <div className="card">
      <h2>Create a payment link</h2>
      <p className="muted">
        A shareable link + QR code. Your customer pays in BCH straight to your address — CashLink never
        holds the money.
      </p>
      <form onSubmit={handleCreate} className="form">
        <label>
          Amount
          <div className="amount-row">
            <input
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder={amountMode === 'usd' ? '5.00' : '0.02'}
              required
            />
            <select value={amountMode} onChange={(e) => setAmountMode(e.target.value as 'bch' | 'usd')}>
              <option value="usd">USD</option>
              <option value="bch">BCH</option>
            </select>
          </div>
          <span className="small muted">
            {amountSats !== null
              ? amountMode === 'usd'
                ? `≈ ${formatBch(amountSats)} BCH`
                : priceUsd !== null
                  ? `≈ ${formatUsd(satsToUsd(amountSats, priceUsd))}`
                  : '—'
              : priceUsd === null && amountMode === 'usd'
                ? 'Waiting for the BCH price…'
                : 'Enter an amount'}
          </span>
        </label>
        <label>
          Label
          <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Coffee — flat white" maxLength={120} required />
        </label>
        <label>
          Note for the payer (optional)
          <input type="text" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="e.g. Table 4, thank you!" maxLength={500} />
        </label>
        <label>
          Payout address
          <input
            type="text"
            value={wallet?.receiveAddress ?? to}
            onChange={(e) => setTo(e.target.value)}
            placeholder="bitcoincash:q…"
            readOnly={!!wallet}
          />
          <span className="small muted">
            {wallet ? 'Filled in from your connected wallet.' : 'Connect your wallet above to fill this in, or paste any BCH address.'}
          </span>
        </label>
        <label>
          Expires after
          <select value={expiryHours} onChange={(e) => setExpiryHours(e.target.value)}>
            <option value="1">1 hour</option>
            <option value="24">24 hours</option>
            <option value="168">7 days</option>
            <option value="0">Never</option>
          </select>
        </label>
        {error && <div className="error">{error}</div>}
        <button type="submit" className="btn primary big">
          Create payment link
        </button>
      </form>

      {created && (
        <div className="created">
          <h3>Your link is ready</h3>
          <div className="qr-wrap">
            <QRCodeSVG value={bip21} size={180} />
            <div className="small muted">Scan with any BCH wallet to pay {formatBch(created.amountSats)} BCH</div>
          </div>
          <label>
            Share link
            <div className="copy-row">
              <input type="text" readOnly value={shareUrl} onClick={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copy(shareUrl)}>
                Copy
              </button>
            </div>
          </label>
          <label>
            BIP21 payment URI
            <div className="copy-row">
              <input type="text" readOnly value={bip21} onClick={(e) => e.currentTarget.select()} />
              <button type="button" className="btn" onClick={() => copy(bip21)}>
                Copy
              </button>
            </div>
          </label>
          <p className="small muted">
            Invoice <span className="mono">{created.id}</span> · {formatBch(created.amountSats)} BCH · saved on this
            device under “My invoices”.
          </p>
          <button type="button" className="btn ghost" onClick={() => setCreated(null)}>
            Create another
          </button>
        </div>
      )}
    </div>
  );
}
