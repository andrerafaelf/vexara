'use client';

import { useEffect, useState } from 'react';
import {
  getMyNexuses,
  getMyPendingTokens,
  getMyReferrals,
  getMyReferrer,
  redeemReferralToken,
  setReferrer,
} from '../services/api';
import '../styles/ReferralsTab.css';

const THRESHOLD = 500;

const TROOP_LABELS: Record<string, string> = {
  lancerDrone: 'Lancer Drone', assaultTrooper: 'Assault Trooper', breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative', skimmerBike: 'Skimmer Bike', bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team', disruptorUnit: 'Disruptor Unit', interceptorBike: 'Interceptor Bike',
  siegeMech: 'Siege Mech', annihilatorPlatform: 'Annihilator Platform',
};

const TROOP_KEYS = Object.keys(TROOP_LABELS);

const BUILDING_LABELS: Record<string, string> = {
  commandCore: 'Command Core', recruitmentCore: 'Recruitment Core', lifeSupport: 'Life Support',
  storageVault: 'Storage Vault', biomassFarm: 'Biomass Farm', alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor', shieldGrid: 'Shield Grid',
};

const BUILDING_KEYS = Object.keys(BUILDING_LABELS);

// Grant table matches server constants
const TROOP_GRANTS: Record<string, [number, number, number, number]> = {
  lancerDrone:          [35,  75,  120, 180],
  breakerUnit:          [35,  75,  120, 180],
  assaultTrooper:       [20,  45,  75,  110],
  reconOperative:       [20,  45,  75,  110],
  bulwarkGuard:         [15,  32,  50,  75],
  suppressorTeam:       [15,  32,  50,  75],
  skimmerBike:          [12,  25,  40,  60],
  disruptorUnit:        [12,  25,  40,  60],
  interceptorBike:      [12,  25,  40,  60],
  siegeMech:            [5,   12,  20,  30],
  annihilatorPlatform:  [2,   5,   10,  15],
};

function ccTier(level: number): 0 | 1 | 2 | 3 {
  if (level <= 4) return 0;
  if (level <= 8) return 1;
  if (level <= 12) return 2;
  return 3;
}

interface ReferralRow {
  tokenId: number;
  refereeId: number;
  refereeUsername: string;
  refereePoints: number;
  thresholdMet: boolean;
  redeemed: boolean;
  redeemedAt: string | null;
  rewardType: string | null;
  rewardMeta: Record<string, unknown> | null;
}

interface PendingToken {
  id: number;
  refereeId: number;
}

interface ReferrerInfo {
  username: string;
  thresholdMet: boolean;
  redeemed: boolean;
  referrerPoints: number;
}

interface NexusSummary {
  id: string;
  name: string;
  commandCore: number;
  populationCurrent: number;
  populationMax: number;
}

type RewardType = 'building_instant' | 'troop_grant';

interface RedeemState {
  tokenId: number;
  rewardType: RewardType;
  nexusId: string;
  building: string;
  troopType: string;
}

export default function ReferralsTab() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [pendingTokens, setPendingTokens] = useState<PendingToken[]>([]);
  const [referrer, setReferrer_] = useState<ReferrerInfo | null>(null);
  const [nexuses, setNexuses] = useState<NexusSummary[]>([]);
  const [referrerInput, setReferrerInput] = useState('');
  const [referrerError, setReferrerError] = useState('');
  const [referrerSubmitting, setReferrerSubmitting] = useState(false);

  const [redeemState, setRedeemState] = useState<RedeemState | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState('');

  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [referralsRes, pendingRes, referrerRes, nexusRes] = await Promise.all([
        getMyReferrals(),
        getMyPendingTokens(),
        getMyReferrer(),
        getMyNexuses(),
      ]);
      setReferrals(referralsRes.data);
      setPendingTokens(pendingRes.data);
      setReferrer_(referrerRes.data.referrer);
      const mappedNexuses: NexusSummary[] = (nexusRes.data as any[]).map((n: any) => ({
        id: String(n.id),
        name: n.name,
        commandCore: n.commandCore ?? 0,
        populationCurrent: n.populationCurrent ?? 0,
        populationMax: n.populationMax ?? 24,
      }));
      setNexuses(mappedNexuses);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const handleSetReferrer = async (e: React.FormEvent) => {
    e.preventDefault();
    setReferrerError('');
    setReferrerSubmitting(true);
    try {
      await setReferrer(referrerInput.trim());
      setReferrerInput('');
      await load();
    } catch (err) {
      setReferrerError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to set referrer',
      );
    } finally {
      setReferrerSubmitting(false);
    }
  };

  const openRedeem = (tokenId: number) => {
    setRedeemError('');
    setRedeemSuccess('');
    setRedeemState({
      tokenId,
      rewardType: 'troop_grant',
      nexusId: nexuses[0]?.id ?? '',
      building: BUILDING_KEYS[0],
      troopType: TROOP_KEYS[0],
    });
  };

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!redeemState) return;
    setRedeemError('');
    setRedeemSubmitting(true);
    try {
      const res = await redeemReferralToken(
        redeemState.tokenId,
        redeemState.rewardType,
        parseInt(redeemState.nexusId, 10),
        redeemState.rewardType === 'building_instant'
          ? { building: redeemState.building }
          : { troopType: redeemState.troopType },
      );
      setRedeemSuccess((res.data as any).message);
      setRedeemState(null);
      await load();
    } catch (err) {
      setRedeemError(
        (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Redemption failed',
      );
    } finally {
      setRedeemSubmitting(false);
    }
  };

  const selectedNexus = nexuses.find((n) => n.id === redeemState?.nexusId);
  const ccLevel = selectedNexus?.commandCore ?? 0;
  const tier = ccTier(ccLevel);
  const troopGrantPreview = redeemState ? (TROOP_GRANTS[redeemState.troopType]?.[tier] ?? 0) : 0;

  const pendingCount = pendingTokens.length;

  if (loading) return <div className="referrals-loading">Loading...</div>;

  return (
    <div className="referrals-tab">

      {/* Referrer section — who referred you */}
      <section className="referrals-section">
        <h3 className="referrals-section-title">Referred By</h3>
        {referrer ? (
          <div className="referrals-referrer-card">
            <span className="referrals-referrer-name">{referrer.username}</span>
            {referrer.thresholdMet ? (
              <span className="referrals-badge referrals-badge--done">Reward unlocked</span>
            ) : (
              <span className="referrals-badge referrals-badge--progress">
                Your progress: {THRESHOLD} pts needed to unlock their reward
              </span>
            )}
          </div>
        ) : (
          <form className="referrals-referrer-form" onSubmit={handleSetReferrer}>
            <p className="referrals-hint">
              Enter the username of the player who invited you. Once you reach {THRESHOLD} influence points, they receive a reward token. This can only be set once.
            </p>
            <div className="referrals-referrer-inline">
              <input
                type="text"
                value={referrerInput}
                onChange={(e) => setReferrerInput(e.target.value)}
                placeholder="Their username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                disabled={referrerSubmitting}
                maxLength={20}
              />
              <button type="submit" className="referrals-btn primary" disabled={referrerSubmitting || !referrerInput.trim()}>
                {referrerSubmitting ? 'Saving...' : 'Set'}
              </button>
            </div>
            {referrerError && <div className="referrals-error">{referrerError}</div>}
          </form>
        )}
      </section>

      {/* Pending redemptions */}
      {pendingCount > 0 && (
        <section className="referrals-section">
          <h3 className="referrals-section-title">
            Unclaimed Tokens
            <span className="referrals-count-badge">{pendingCount}</span>
          </h3>
          <p className="referrals-hint">Each token is a one-time reward. Choose a nexus and reward type below.</p>
          {redeemSuccess && <div className="referrals-success">{redeemSuccess}</div>}
          {redeemState ? (
            <form className="referrals-redeem-form" onSubmit={handleRedeem}>
              <label className="referrals-field">
                <span className="referrals-label">Nexus</span>
                <select
                  value={redeemState.nexusId}
                  onChange={(e) => setRedeemState({ ...redeemState, nexusId: e.target.value })}
                  disabled={redeemSubmitting}
                >
                  {nexuses.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.name} (CC {n.commandCore})
                    </option>
                  ))}
                </select>
              </label>

              <div className="referrals-reward-type-row">
                <label className={`referrals-reward-option ${redeemState.rewardType === 'troop_grant' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="rewardType"
                    value="troop_grant"
                    checked={redeemState.rewardType === 'troop_grant'}
                    onChange={() => setRedeemState({ ...redeemState, rewardType: 'troop_grant' })}
                  />
                  Troop Grant
                </label>
                <label className={`referrals-reward-option ${redeemState.rewardType === 'building_instant' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="rewardType"
                    value="building_instant"
                    checked={redeemState.rewardType === 'building_instant'}
                    onChange={() => setRedeemState({ ...redeemState, rewardType: 'building_instant' })}
                  />
                  Instant Building Level
                </label>
              </div>

              {redeemState.rewardType === 'troop_grant' && (
                <label className="referrals-field">
                  <span className="referrals-label">Troop Type</span>
                  <select
                    value={redeemState.troopType}
                    onChange={(e) => setRedeemState({ ...redeemState, troopType: e.target.value })}
                    disabled={redeemSubmitting}
                  >
                    {TROOP_KEYS.map((t) => (
                      <option key={t} value={t}>{TROOP_LABELS[t]}</option>
                    ))}
                  </select>
                  {selectedNexus && (
                    <span className="referrals-preview">
                      ~{troopGrantPreview} units (CC {ccLevel}, tier {tier + 1}/4)
                    </span>
                  )}
                </label>
              )}

              {redeemState.rewardType === 'building_instant' && (
                <label className="referrals-field">
                  <span className="referrals-label">Building to Level Up</span>
                  <select
                    value={redeemState.building}
                    onChange={(e) => setRedeemState({ ...redeemState, building: e.target.value })}
                    disabled={redeemSubmitting}
                  >
                    {BUILDING_KEYS.map((b) => (
                      <option key={b} value={b}>{BUILDING_LABELS[b]}</option>
                    ))}
                  </select>
                  <span className="referrals-preview">2 instant levels, no resource cost, no queue.</span>
                </label>
              )}

              {redeemError && <div className="referrals-error">{redeemError}</div>}

              <div className="referrals-redeem-actions">
                <button type="button" className="referrals-btn" onClick={() => setRedeemState(null)} disabled={redeemSubmitting}>
                  Cancel
                </button>
                <button type="submit" className="referrals-btn primary" disabled={redeemSubmitting || !redeemState.nexusId}>
                  {redeemSubmitting ? 'Redeeming...' : 'Redeem Token'}
                </button>
              </div>
            </form>
          ) : (
            <div className="referrals-token-list">
              {pendingTokens.map((t) => {
                const row = referrals.find((r) => r.tokenId === t.id);
                return (
                  <div key={t.id} className="referrals-token-card">
                    <div className="referrals-token-info">
                      <span className="referrals-token-label">Token from referral</span>
                      {row && <span className="referrals-token-meta">{row.refereeUsername} reached {THRESHOLD} pts</span>}
                    </div>
                    <button className="referrals-btn primary" onClick={() => openRedeem(t.id)}>
                      Claim
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Referral list — who you've referred */}
      <section className="referrals-section">
        <h3 className="referrals-section-title">Your Referrals</h3>
        {referrals.length === 0 ? (
          <p className="referrals-hint">
            No referrals yet. Tell players to enter your username in their Referrals tab when they sign up.
          </p>
        ) : (
          <ul className="referrals-list">
            {referrals.map((r) => (
              <li key={r.tokenId} className={`referrals-list-item ${r.redeemed ? 'referrals-list-item--done' : ''}`}>
                <div className="referrals-list-info">
                  <span className="referrals-list-name">{r.refereeUsername}</span>
                  <div className="referrals-list-meta">
                    <span>{r.refereePoints} pts</span>
                    {r.redeemed ? (
                      <span className="referrals-badge referrals-badge--done">Reward claimed</span>
                    ) : (
                      <span className="referrals-badge referrals-badge--ready">Token ready</span>
                    )}
                  </div>
                </div>
                <div className="referrals-progress-bar-wrap">
                  <div
                    className="referrals-progress-bar"
                    style={{ width: `${Math.min(100, (r.refereePoints / THRESHOLD) * 100)}%` }}
                  />
                </div>
                <span className="referrals-progress-label">
                  {Math.min(r.refereePoints, THRESHOLD)} / {THRESHOLD} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
