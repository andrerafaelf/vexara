import { Mail, Radio, Send } from 'lucide-react';
import React, { useState } from 'react';
import type { AdminFetch } from '../types/admin';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface BroadcastPreview {
  total: number;
  fromUsers: number;
  fromSignups: number;
  sample: { email: string; displayName: string; source: string }[];
}

interface Props {
  adminFetch: AdminFetch;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export default function BroadcastTab({ adminFetch, showToast }: Props) {
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [confirmInput, setConfirmInput] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/broadcast/galaxy-live/preview`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) {
        setPreview(data);
      } else {
        showToast(data?.error || 'Failed to load preview', 'error');
      }
    } catch {
      showToast('Error loading preview', 'error');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSendTest = async () => {
    setTestSending(true);
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/broadcast/galaxy-live/test`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(data.message || 'Test email sent', 'success');
      } else {
        showToast(data.error || 'Failed to send test email', 'error');
      }
    } catch {
      showToast('Error sending test email', 'error');
    } finally {
      setTestSending(false);
    }
  };

  const handleBroadcast = async () => {
    setBroadcastSending(true);
    setShowConfirm(false);
    setConfirmInput('');
    try {
      const res = await adminFetch(`${ADMIN_API_URL}/broadcast/galaxy-live`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        showToast(`Broadcast sent to ${data.sent ?? '?'} recipients`, 'success');
        setPreview(null);
      } else {
        showToast(data.error || 'Broadcast failed', 'error');
      }
    } catch {
      showToast('Error sending broadcast', 'error');
    } finally {
      setBroadcastSending(false);
    }
  };

  return (
    <div>
      <div className="admin-section">
        <div className="admin-section-header">
          <h3>
            <Radio size={16} aria-hidden="true" /> Galaxy-Live Launch Broadcast
          </h3>
        </div>

        <div style={{ padding: '4px 0 16px', color: 'var(--text-muted)', fontSize: '0.9em', lineHeight: 1.6, maxWidth: 600 }}>
          Send the galaxy-live announcement email to all registered users and waitlist signups.
          Use <strong>Preview</strong> to see the recipient count, <strong>Send Test</strong> to preview the email in your inbox,
          then <strong>Broadcast</strong> to send to everyone.
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 20 }}>
          <button className="btn-secondary" onClick={handlePreview} disabled={previewLoading}>
            {previewLoading ? 'Loading…' : 'Preview Recipients'}
          </button>
          <button
            className="btn-action btn-notif"
            onClick={handleSendTest}
            disabled={testSending}
            style={{ padding: '8px 14px' }}
          >
            <Mail size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            {testSending ? 'Sending…' : 'Send Test Email'}
          </button>
          <button
            className="btn-primary"
            style={{ background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.35)' }}
            onClick={() => setShowConfirm(true)}
            disabled={broadcastSending}
          >
            <Send size={13} style={{ marginRight: 5, verticalAlign: '-2px' }} />
            {broadcastSending ? 'Broadcasting…' : 'Broadcast to All'}
          </button>
        </div>

        {preview && (
          <div className="broadcast-preview">
            <div className="broadcast-preview-stats">
              <div className="broadcast-stat">
                <span className="broadcast-stat-value">{preview.total}</span>
                <span className="broadcast-stat-label">Total Recipients</span>
              </div>
              <div className="broadcast-stat">
                <span className="broadcast-stat-value">{preview.fromUsers}</span>
                <span className="broadcast-stat-label">Registered Users</span>
              </div>
              <div className="broadcast-stat">
                <span className="broadcast-stat-value">{preview.fromSignups}</span>
                <span className="broadcast-stat-label">Waitlist</span>
              </div>
            </div>
            {preview.sample.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: '0.78em', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                  Sample Recipients
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {preview.sample.map((r) => (
                    <div key={r.email} style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: '0.875em', color: 'var(--text-default)' }}>
                      <span style={{ fontWeight: 600 }}>{r.displayName}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{r.email}</span>
                      <span style={{
                        fontSize: '0.75em',
                        padding: '1px 6px',
                        borderRadius: 3,
                        background: r.source === 'user' ? 'rgba(122,162,255,0.15)' : 'rgba(245,158,11,0.15)',
                        color: r.source === 'user' ? '#7aa2ff' : 'var(--warning)',
                      }}>
                        {r.source}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Broadcast confirm modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={() => { setShowConfirm(false); setConfirmInput(''); }}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ borderColor: 'rgba(248,81,73,0.4)' }}>
            <div className="modal-header">
              <h3 style={{ color: 'var(--danger)' }}>Confirm Broadcast</h3>
              <button className="modal-close" onClick={() => { setShowConfirm(false); setConfirmInput(''); }}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-default)', marginBottom: 12 }}>
                This will send the galaxy-live email to{' '}
                <strong>{preview ? `${preview.total} recipients` : 'all recipients'}</strong>. This cannot be undone.
              </p>
              <p style={{ fontSize: '0.875em', color: 'var(--text-muted)', marginBottom: 12 }}>
                Type <strong>broadcast</strong> to confirm.
              </p>
              <input
                type="text"
                value={confirmInput}
                onChange={(e) => setConfirmInput(e.target.value)}
                placeholder='Type "broadcast" to confirm'
                autoFocus
                style={{
                  width: '100%',
                  padding: '9px 10px',
                  background: 'var(--color-navy-900)',
                  border: '1px solid var(--color-navy-400)',
                  color: 'var(--text-strong)',
                  borderRadius: 4,
                  boxSizing: 'border-box',
                }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => { setShowConfirm(false); setConfirmInput(''); }}>Cancel</button>
              <button
                disabled={confirmInput !== 'broadcast'}
                onClick={handleBroadcast}
                style={{
                  background: confirmInput === 'broadcast' ? 'var(--danger)' : 'var(--danger-soft)',
                  color: 'var(--text-strong)',
                  border: '1px solid rgba(248,81,73,0.4)',
                  padding: '9px 20px',
                  borderRadius: 4,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: confirmInput === 'broadcast' ? 'pointer' : 'not-allowed',
                  opacity: confirmInput === 'broadcast' ? 1 : 0.5,
                }}
              >
                Send Broadcast
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
