import { useEffect, useState } from 'react';
import { useWizardConnect, WizardConnectQRDialog } from '@wizardconnect/react';
import type { DappConnectionManager } from '@wizardconnect/dapp';
import { pubkeyToCashaddr, fetchPayerUtxos, sumUtxos, type PayerAddress } from '../lib/bch.ts';
import { formatBch } from '../lib/invoice.ts';

/** Receive addresses scanned for funds (indices 0..4) + the change address. */
export const RECEIVE_SCAN_COUNT = 5;

export interface ConnectedWallet {
  name: string | null;
  receiveAddress: string;
  changeAddress: string;
  balanceSats: bigint;
  payerAddresses: PayerAddress[];
}

/**
 * WizardConnect wallet panel: connect button + QR dialog + connected state.
 * On connect it derives the wallet's receive/change addresses from the xpub
 * (no private key ever leaves the wallet) and reads the balance.
 */
export default function WalletPanel({
  onWallet,
  onManager,
}: {
  onWallet: (w: ConnectedWallet | null) => void;
  onManager: (m: DappConnectionManager | null) => void;
}) {
  const wc = useWizardConnect({ dappName: 'CashLink' });
  const [wallet, setWallet] = useState<ConnectedWallet | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onManager(wc.manager);
    if (wc.state !== 'connected' || !wc.manager) {
      if (wc.state === 'idle' || wc.state === 'disconnected') {
        setWallet(null);
        onWallet(null);
      }
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const mgr = wc.manager!;
        const payerAddresses: PayerAddress[] = [];
        for (let i = 0; i < RECEIVE_SCAN_COUNT; i++) {
          const pubkey = mgr.getPubkey(0, BigInt(i));
          if (!pubkey) continue;
          payerAddresses.push({ cashaddr: pubkeyToCashaddr(pubkey), pathName: 'receive', pathIndex: i });
        }
        const changePubkey = mgr.getPubkey(1, 0n);
        const changeAddress = changePubkey ? pubkeyToCashaddr(changePubkey) : payerAddresses[0]?.cashaddr ?? '';
        if (changePubkey) {
          payerAddresses.push({ cashaddr: changeAddress, pathName: 'change', pathIndex: 0 });
        }
        if (payerAddresses.length === 0) throw new Error('Could not derive addresses from the wallet.');
        const utxos = await fetchPayerUtxos(payerAddresses);
        const balance = sumUtxos(utxos);
        const info: ConnectedWallet = {
          name: wc.walletName,
          receiveAddress: payerAddresses[0].cashaddr,
          changeAddress,
          balanceSats: balance,
          payerAddresses,
        };
        if (!cancelled) {
          setWallet(info);
          onWallet(info);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to read the wallet.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wc.state, wc.manager]);

  return (
    <div className="wallet-panel">
      {wallet ? (
        <div className="wallet-connected">
          <span className="dot" />
          <div>
            <strong>{wallet.name ?? 'BCH wallet'}</strong>
            <div className="mono small">{wallet.receiveAddress}</div>
            <div className="small">
              Balance on scanned addresses: <strong>{formatBch(Number(wallet.balanceSats))} BCH</strong>
            </div>
          </div>
          <button className="btn ghost" onClick={() => void wc.disconnect()}>
            Disconnect
          </button>
        </div>
      ) : (
        <div className="wallet-connect">
          <button className="btn primary" onClick={() => wc.connect()} disabled={wc.state !== 'idle' && wc.state !== 'disconnected'}>
            {wc.state === 'connecting' ? 'Waiting for wallet…' : 'Connect BCH wallet'}
          </button>
          <span className="small muted">via WizardConnect — Paytaca & other BCH wallets. Your keys never leave your wallet.</span>
          {loading && <span className="small">Reading addresses…</span>}
          {error && <span className="error small">{error}</span>}
          {wc.error && <span className="error small">{wc.error}</span>}
        </div>
      )}
      {wc.uri && wc.qrUri && (
        <WizardConnectQRDialog
          show={wc.state === 'connecting'}
          onClose={() => void wc.disconnect()}
          uri={wc.uri}
          qrUri={wc.qrUri}
          title="CashLink"
          subtitle="Scan with your BCH wallet to connect"
        />
      )}
    </div>
  );
}
