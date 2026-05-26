'use client';

import GameLayout from '@/components/GameLayout';
import PageSkeleton from '@/components/PageSkeleton';
import { usePageReady } from '@/components/NavigationProgress';
import {
  cancelFriendRequest,
  getPublicProfile,
  removeFriend,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
} from '@/services/api';
import '@/styles/ProfileStats.css';
import { Crown, UserPlus, UserCheck, UserMinus, Clock } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Username from '@/components/Username';
import Avatar from '@/components/Avatar';
import type { SupporterTier } from '@/types/game';

type FriendshipStatus = 'self' | 'none' | 'pending_outgoing' | 'pending_incoming' | 'friends';

interface GalaxyEntry {
  galaxyId: number;
  galaxyName: string;
  status: 'active' | 'ended';
  startsAt: string | null;
  endedAt: string | null;
  joinedAt: string;
  livePoints: number;
  finalPoints: number | null;
  effectivePoints: number;
  isWinner: boolean;
  isCurrent: boolean;
  faction: { id: number; name: string; tag: string; role: string } | null;
}

interface PublicProfile {
  userId: number;
  username: string;
  isSupporter: boolean;
  supporterTier?: SupporterTier | null;
  isFounder?: boolean;
  avatarUrl?: string | null;
  avatarUrlSm?: string | null;
  createdAt: string;
  accountAgeDays: number;
  totalInfluence: number;
  bestSingleGalaxy: number;
  galaxiesWon: number;
  galaxiesPlayed: number;
  galaxies: GalaxyEntry[];
  friendship: { status: FriendshipStatus; requestId?: number };
}

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return String(Math.round(n));
}

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="ps-card">
      <div className="ps-card-value">{value}</div>
      <div className="ps-card-label">{label}</div>
      {sub && <div className="ps-card-sub">{sub}</div>}
    </div>
  );
}

export default function PublicProfilePage() {
  const params = useParams();
  const router = useRouter();
  const username = decodeURIComponent(String(params.username || ''));

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [friendBusy, setFriendBusy] = useState(false);

  usePageReady(!loading, 'public-profile');

  const load = useCallback(() => {
    setLoading(true);
    getPublicProfile(username)
      .then((res) => { setProfile(res.data); setError(null); })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [username]);

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
      router.push('/login');
      return;
    }
    load();
  }, [load, router]);

  const handleFriendAction = async () => {
    if (!profile) return;
    setFriendBusy(true);
    try {
      const fs = profile.friendship;
      if (fs.status === 'none') {
        await sendFriendRequest(profile.username);
      } else if (fs.status === 'pending_outgoing' && fs.requestId) {
        await cancelFriendRequest(String(fs.requestId));
      } else if (fs.status === 'pending_incoming' && fs.requestId) {
        await acceptFriendRequest(String(fs.requestId));
      } else if (fs.status === 'friends') {
        await removeFriend(String(profile.userId));
      }
      load();
    } finally {
      setFriendBusy(false);
    }
  };

  const handleDecline = async () => {
    if (!profile?.friendship.requestId) return;
    setFriendBusy(true);
    try {
      await declineFriendRequest(String(profile.friendship.requestId));
      load();
    } finally {
      setFriendBusy(false);
    }
  };

  if (loading) {
    return (
      <GameLayout activePage="profile">
        <PageSkeleton variant="rows" count={5} />
      </GameLayout>
    );
  }
  if (error || !profile) {
    return (
      <GameLayout activePage="profile">
        <div className="profile-stats">
          <div className="ps-error">{error || 'User not found'}</div>
        </div>
      </GameLayout>
    );
  }

  const fs = profile.friendship;

  return (
    <GameLayout activePage="profile">
      <div className="profile-stats">
        <div className="ps-header">
          <Avatar
            username={profile.username}
            avatarUrl={profile.avatarUrl ?? null}
            avatarUrlSm={profile.avatarUrlSm ?? null}
            size="lg"
            className={`ps-avatar${profile.supporterTier === 'officer' ? ' supporter-border supporter-border-officer' : ''}${profile.supporterTier === 'commander' ? ' supporter-border supporter-border-commander' : ''}`}
            ariaHidden
          />
          <div className="ps-header-info">
            <h2 className="ps-username">
              <Username
                name={profile.username}
                isSupporter={profile.isSupporter}
                supporterTier={profile.supporterTier ?? null}
                isFounder={profile.isFounder}
              />
            </h2>
            <span className="ps-meta">
              {profile.totalInfluence.toLocaleString()} total influence · {profile.galaxiesPlayed} galax{profile.galaxiesPlayed === 1 ? 'y' : 'ies'} played · {profile.accountAgeDays}d
            </span>
          </div>

          {fs.status !== 'self' && (
            <div className="pp-friend-actions" style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              {fs.status === 'none' && (
                <button className="ps-tab" onClick={handleFriendAction} disabled={friendBusy}>
                  <UserPlus size={14} aria-hidden="true" />
                  <span>Add friend</span>
                </button>
              )}
              {fs.status === 'pending_outgoing' && (
                <button className="ps-tab" onClick={handleFriendAction} disabled={friendBusy}>
                  <Clock size={14} aria-hidden="true" />
                  <span>Cancel request</span>
                </button>
              )}
              {fs.status === 'pending_incoming' && (
                <>
                  <button className="ps-tab" onClick={handleFriendAction} disabled={friendBusy}>
                    <UserCheck size={14} aria-hidden="true" />
                    <span>Accept</span>
                  </button>
                  <button className="ps-tab" onClick={handleDecline} disabled={friendBusy}>
                    <UserMinus size={14} aria-hidden="true" />
                    <span>Decline</span>
                  </button>
                </>
              )}
              {fs.status === 'friends' && (
                <button className="ps-tab" onClick={handleFriendAction} disabled={friendBusy} title="Remove friend">
                  <UserCheck size={14} aria-hidden="true" />
                  <span>Friends</span>
                </button>
              )}
            </div>
          )}
        </div>

        <div className="ps-section">
          <h3 className="ps-section-title">Overview</h3>
          <div className="ps-section-body">
            <div className="ps-cards">
              <StatCard label="Total Influence" value={profile.totalInfluence.toLocaleString()} sub="Winning galaxies only" />
              <StatCard label="Best Galaxy" value={fmt(profile.bestSingleGalaxy)} />
              <StatCard label="Galaxies Won" value={profile.galaxiesWon} sub={`out of ${profile.galaxiesPlayed}`} />
              <StatCard label="Account Age" value={`${profile.accountAgeDays}d`} />
            </div>
          </div>
        </div>

        <div className="ps-section">
          <h3 className="ps-section-title">Galaxies</h3>
          <div className="ps-section-body">
            {profile.galaxies.length === 0 ? (
              <div className="ps-card-sub">No galaxies played yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {profile.galaxies.map((g) => {
                  const ended = g.status === 'ended';
                  const lost = ended && !g.isWinner;
                  return (
                    <div
                      key={g.galaxyId}
                      className="ps-card"
                      style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'space-between' }}
                    >
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <strong>{g.galaxyName}</strong>
                          {g.isCurrent && <span className="ps-card-sub">· current</span>}
                          {ended && g.isWinner && (
                            <span className="ps-card-sub" style={{ color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <Crown size={12} aria-hidden="true" /> winner
                            </span>
                          )}
                          {ended && !g.isWinner && <span className="ps-card-sub">· ended</span>}
                        </div>
                        <div className="ps-card-sub">
                          {g.faction ? `${g.faction.name} [${g.faction.tag}]` : 'No faction'}
                          {g.faction && g.faction.role !== 'member' ? ` · ${g.faction.role}` : ''}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div className="ps-card-value">
                          {lost ? '0' : g.effectivePoints.toLocaleString()}
                        </div>
                        <div className="ps-card-sub">
                          {lost ? 'lost · counts as 0' : ended ? 'final influence' : 'current influence'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </GameLayout>
  );
}
