// CashLink — browser-local storage for created invoices + payment records.
// Everything stays on the user's device; there is no backend and no account.

import type { Invoice } from './invoice.ts';

const INVOICES_KEY = 'cashlink-invoices-v1';
const PAID_KEY = 'cashlink-paid-v1';

export function loadInvoices(): Invoice[] {
  try {
    const raw = localStorage.getItem(INVOICES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Invoice[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveInvoice(inv: Invoice): Invoice[] {
  const list = loadInvoices().filter((i) => i.id !== inv.id);
  list.unshift(inv);
  try {
    localStorage.setItem(INVOICES_KEY, JSON.stringify(list.slice(0, 100)));
  } catch {
    /* ignore */
  }
  return list;
}

export function loadPaid(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PAID_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return typeof parsed === 'object' && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function markPaid(invoiceId: string, txid: string): void {
  try {
    const paid = loadPaid();
    paid[invoiceId] = txid;
    localStorage.setItem(PAID_KEY, JSON.stringify(paid));
  } catch {
    /* ignore */
  }
}
