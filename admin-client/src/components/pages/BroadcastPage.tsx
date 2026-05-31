'use client';
import { Mail, Radio, Send } from 'lucide-react';
import React, { useState } from 'react';
import type { AdminFetch } from '../../types/admin';
import ConfirmModal from '../shared/ConfirmModal';

const API = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface BroadcastPreview {
  total: number;
  fromUsers: number;
  fromSignups: number;
  sample: { email: string; displayName: string; source: string }[];
}

interface Props {
  adminFetch: AdminFetch;
  showToast: (msg: string, type: 'success' | 'error' | 'info') => void;
}

export default function BroadcastPage({ adminFetch, showToast }: Props) {
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const res = await adminFetch(`${API}/broadcast/galaxy-live/preview`);
      const data = await res.json().catch(() => null);
      if (res.ok && data) setPreview(data);
      else showToast(data?.error || 'Failed to load preview', 'error');
    } catch { showToast('Error loading preview', 'error'); }
    finally   { setPreviewLoading(false); }
  };

  const handleSendTest = async () => {
    setTestSending(true);
    try {
      const res = await adminFetch(`${API}/broadcast/galaxy-live/test`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) showToast(data.message || 'Test email sent', 'success');
      else showToast(data.error || 'Failed', 'error');
    } catch { showToast('Error', 'error'); }
    finally   { setTestSending(false); }
  };

  const handleBroadcast = async () => {
    setShowConfirm(false);
    setBroadcastSending(true);
    try {
      const res = await adminFetch(`${API}/broadcast/galaxy-live`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (res.ok) { showToast(`Broadcast sent to ${data.sent ?? '?'} recipients`, 'success'); setPreview(null); }
      else showToast(data.error || 'Broadcast failed', 'error');
    } catch { showToast('Error', 'error'); }
    finally   { setBroadcastSending(false); }
  };

  return (
    <div className="page-body">
      <div className="section">
        <div className="section-header">
          <span className="section-title"><Radio size={15} /> Galaxy-Live Launch Broadcast</span>
        </div>
        <div className="section-body">
          <p style={{ color: 'var(--text-muted)', fontSize: 13, lineHeight: 1.6, maxWidth: 560, marginBottom: 20 }}>
            Send the galaxy-live announcement email to all registered users and waitlist signups.
            Preview the recipient list first, send yourself a test copy, then broadcast to everyone.
          </p>

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={handlePreview} disabled={previewLoading}>
              {previewLoading ? <><span className="spinner" style={{ width: 12, height: 12 }} /> Loading…</> : 'Preview Recipients'}
            </button>
            <button className="btn btn-ghost" onClick={handleSendTest} disabled={testSending}>
              <Mail size={13} />
              {testSending ? 'Sending…' : 'Send Test Email'}
            </button>
            <button className="btn btn-danger" onClick={() => setShowConfirm(true)} disabled={broadcastSending}>
              <Send size={13} />
              {broadcastSending ? 'Broadcasting…' : 'Broadcast to All'}
            </button>
          </div>

          {preview && (
            <div className="broadcast-preview">
              <div className="broadcast-stats">
                <div className="bc-stat"><span className="bc-stat-value">{preview.total}</span><span className="bc-stat-label">Total Recipients</span></div>
                <div className="bc-stat"><span className="bc-stat-value">{preview.fromUsers}</span><span className="bc-stat-label">Registered Users</span></div>
                <div className="bc-stat"><span className="bc-stat-value">{preview.fromSignups}</span><span className="bc-stat-label">Waitlist</span></div>
              </div>
              {preview.sample.length > 0 && (
                <>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.10em', color: 'var(--text-faint)', marginBottom: 8 }}>
                    Sample Recipients
                  </div>
                  <div className="bc-sample-list">
                    {preview.sample.map((r) => (
                      <div key={r.email} className="bc-sample-item">
                        <span style={{ fontWeight: 600, color: 'var(--text-default)' }}>{r.displayName}</span>
                        <span style={{ color: 'var(--text-muted)' }}>{r.email}</span>
                        <span className={`badge ${r.source === 'user' ? 'badge-teal' : 'badge-accent'}`}>{r.source}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {showConfirm && (
        <ConfirmModal
          title="Confirm Broadcast"
          description={`Send the galaxy-live email to ${preview ? preview.total : 'all'} recipients? This cannot be undone.`}
          typeToConfirm="broadcast"
          confirmLabel="Send Broadcast"
          variant="danger"
          onConfirm={handleBroadcast}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  );
}
