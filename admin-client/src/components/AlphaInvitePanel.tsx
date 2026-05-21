'use client';

import { useCallback, useEffect, useState } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

interface AlphaInviteStatus {
  total: number;
  invited: number;
  unsubscribed: number;
  eligible: number;
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

  return (
    <div className="admin-section" style={{ marginBottom: 28 }}>
      <div className="admin-section-header">
        <h3>Alpha Waitlist</h3>
      </div>

      {loading ? (
        <p style={{ color: '#8a98c2', fontSize: '0.9em' }}>Loading…</p>
      ) : status ? (
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: '0.9em', color: '#c8ccd6' }}>
          <div><strong style={{ color: '#fff' }}>{status.total}</strong> total signups</div>
          <div><strong style={{ color: '#fff' }}>{status.invited}</strong> invited</div>
          <div><strong style={{ color: '#fff' }}>{status.unsubscribed}</strong> unsubscribed</div>
          <div><strong style={{ color: '#7aa2ff' }}>{status.eligible}</strong> eligible</div>
        </div>
      ) : null}
    </div>
  );
}
