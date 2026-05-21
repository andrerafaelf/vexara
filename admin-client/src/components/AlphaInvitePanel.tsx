'use client';

import { Send } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface AlphaInviteStatus {
  total: number;
  invited: number;
  unsubscribed: number;
  eligible: number;
  inFlight: boolean;
}

interface BlastResult {
  ok: boolean;
  attempted: number;
  sent: number;
  failed: Array<{ email: string; error: string }>;
}

interface Props {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

function authHeader(): Record<string, string> {
  const token = sessionStorage.getItem('admin_basic_auth');
  return token ? { Authorization: `Basic ${token}` } : {};
}

export default function AlphaInvitePanel({ showToast }: Props) {
  const [status, setStatus] = useState<AlphaInviteStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [blasting, setBlasting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [lastResult, setLastResult] = useState<BlastResult | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [testSending, setTestSending] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`${ADMIN_API_URL}/alpha-invite/status`, { headers: authHeader() });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const data = (await res.json()) as AlphaInviteStatus;
      setStatus(data);
    } catch (err) {
      showToast(`Failed to load alpha invite status: ${(err as Error).message}`, 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const handleTestSend = async () => {
    if (!testEmail) return;
    setTestSending(true);
    try {
      const res = await fetch(`${ADMIN_API_URL}/alpha-invite/test`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: testEmail }),
      });
      const data = (await res.json()) as { ok: boolean; email: string } | { error: string };
      if (!res.ok) {
        showToast(`Test send failed: ${'error' in data ? data.error : 'Unknown error'}`, 'error');
      } else {
        showToast(`Test email sent to ${testEmail}`, 'success');
        setTestEmail('');
      }
    } catch (err) {
      showToast(`Test send failed: ${(err as Error).message}`, 'error');
    } finally {
      setTestSending(false);
    }
  };

  const handleBlast = async () => {
    setConfirming(false);
    setBlasting(true);
    setLastResult(null);
    try {
      const res = await fetch(`${ADMIN_API_URL}/alpha-invite/blast`, {
        method: 'POST',
        headers: { ...authHeader(), 'Content-Type': 'application/json' },
      });
      const data = (await res.json()) as BlastResult | { error: string };
      if (!res.ok) {
        showToast(`Blast failed: ${('error' in data ? data.error : 'Unknown error')}`, 'error');
        return;
      }
      const result = data as BlastResult;
      setLastResult(result);
      showToast(
        result.failed.length === 0
          ? `Sent ${result.sent} invites successfully.`
          : `Sent ${result.sent} / ${result.attempted}. ${result.failed.length} failed.`,
        result.failed.length === 0 ? 'success' : 'info',
      );
      await loadStatus();
    } catch (err) {
      showToast(`Blast failed: ${(err as Error).message}`, 'error');
    } finally {
      setBlasting(false);
    }
  };

  return (
    <div className="admin-section" style={{ marginBottom: 28 }}>
      <div className="admin-section-header">
        <h3><Send size={16} aria-hidden="true" /> Alpha Invite Blast</h3>
      </div>

      {loading ? (
        <p style={{ color: '#8a98c2', fontSize: '0.9em' }}>Loading…</p>
      ) : status ? (
        <>
          <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', marginBottom: 16, fontSize: '0.9em', color: '#c8ccd6' }}>
            <div><strong style={{ color: '#fff' }}>{status.total}</strong> total signups</div>
            <div><strong style={{ color: '#fff' }}>{status.invited}</strong> already invited</div>
            <div><strong style={{ color: '#fff' }}>{status.unsubscribed}</strong> unsubscribed</div>
            <div><strong style={{ color: '#7aa2ff' }}>{status.eligible}</strong> eligible to send</div>
          </div>

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <input
              type="email"
              placeholder="Test email address"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              style={{ flex: 1, maxWidth: 280, padding: '0.45rem 0.7rem', background: '#0b0d12', border: '1px solid #2c3a78', borderRadius: 4, color: '#fff', fontSize: '0.9em' }}
            />
            <button
              className="btn-primary"
              disabled={testSending || !testEmail}
              onClick={handleTestSend}
            >
              {testSending ? 'Sending…' : 'Send test'}
            </button>
          </div>

          <p style={{ color: '#8a98c2', fontSize: '0.85em', marginBottom: 12 }}>
            Sends the &quot;alpha is open&quot; email to every waitlist signup that hasn&apos;t been invited or unsubscribed. Safe to re-run; only eligible rows are emailed each time.
          </p>

          {!confirming ? (
            <button
              className="btn-primary"
              disabled={blasting || status.eligible === 0 || status.inFlight}
              onClick={() => setConfirming(true)}
            >
              {status.inFlight ? 'Blast in progress…' : blasting ? 'Sending…' : `Send to ${status.eligible} recipient${status.eligible === 1 ? '' : 's'}`}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ color: '#ffb86b', fontSize: '0.9em' }}>
                This will email {status.eligible} people. Are you sure?
              </span>
              <button className="btn-primary" disabled={blasting} onClick={handleBlast}>
                Yes, send now
              </button>
              <button onClick={() => setConfirming(false)} disabled={blasting} style={{ background: 'transparent', color: '#c8ccd6', border: '1px solid #2c3a78', padding: '0.45rem 0.9rem', borderRadius: 4 }}>
                Cancel
              </button>
            </div>
          )}

          {lastResult && (
            <div style={{ marginTop: 16, padding: 12, background: '#0c1430', borderRadius: 6, fontSize: '0.85em', color: '#c8ccd6' }}>
              <div>Last run: {lastResult.sent} / {lastResult.attempted} sent.</div>
              {lastResult.failed.length > 0 && (
                <details style={{ marginTop: 8 }}>
                  <summary style={{ cursor: 'pointer', color: '#ffb86b' }}>
                    {lastResult.failed.length} failed
                  </summary>
                  <ul style={{ marginTop: 8, paddingLeft: 20 }}>
                    {lastResult.failed.map((f, i) => (
                      <li key={i}>{f.email}: {f.error}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
