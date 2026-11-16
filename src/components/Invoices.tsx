import { formatBch, isExpired, type Invoice } from '../lib/invoice.ts';
import { loadInvoices, loadPaid } from '../lib/store.ts';
import { EXPLORER_TX_URL } from '../lib/bch.ts';

/** Merchant's own invoice list (stored on this device only). */
export default function Invoices({ onOpen }: { onOpen: (inv: Invoice) => void }) {
  const invoices = loadInvoices();
  const paid = loadPaid();

  if (invoices.length === 0) {
    return (
      <div className="card">
        <h2>My invoices</h2>
        <p className="muted">No invoices yet — create your first payment link and it will show up here.</p>
      </div>
    );
  }

  return (
    <div className="card">
      <h2>My invoices</h2>
      <ul className="invoice-list">
        {invoices.map((inv) => {
          const txid = paid[inv.id];
          const expired = isExpired(inv);
          return (
            <li key={inv.id}>
              <button type="button" className="invoice-row" onClick={() => onOpen(inv)}>
                <span>
                  <strong>{inv.label}</strong>
                  <span className="small muted"> · {formatBch(inv.amountSats)} BCH · </span>
                  <span className="mono small">{inv.id}</span>
                </span>
                <span className={txid ? 'badge paid' : expired ? 'badge expired' : 'badge open'}>
                  {txid ? 'PAID' : expired ? 'EXPIRED' : 'OPEN'}
                </span>
              </button>
              {txid && txid !== 'demo-simulated-payment-no-real-bch-moved' && (
                <a className="small mono" href={EXPLORER_TX_URL(txid)} target="_blank" rel="noreferrer">
                  {txid.slice(0, 20)}…
                </a>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
