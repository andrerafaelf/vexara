'use client';

import { useEffect, useState } from 'react';
import {
  getMyNexuses,
  getMyPendingTokens,
  getMyReferralCode,
  getMyReferrals,
  getMyReferrer,
  redeemMilestoneToken,
  redeemReferralToken,
  setReferrer,
} from '../services/api';
import '../styles/ReferralsTab.css';

const REFERRAL_THRESHOLD = 1000;
const MILESTONE_THRESHOLD = 500;

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

interface PendingToken { id: number; refereeId?: number; userId?: number; milestone?: number; }

interface ReferrerInfo {
  username: string;
  thresholdMet: boolean;
  referrerPoints: number;
  myPoints: number;
}

interface NexusSummary {
  id: string;
  name: string;
  commandCore: number;
  populationCurrent: number;
  populationMax: number;
}

type RewardType = 'building_instant' | 'troop_grant';
type TokenKind = 'referral' | 'milestone';

interface RedeemState {
  tokenId: number;
  kind: TokenKind;
  rewardType: RewardType;
  nexusId: string;
  building: string;
  troopType: string;
}

export default function ReferralsTab() {
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [pendingReferralTokens, setPendingReferralTokens] = useState<PendingToken[]>([]);
  const [pendingMilestoneTokens, setPendingMilestoneTokens] = useState<PendingToken[]>([]);
  const [referrer, setReferrer_] = useState<ReferrerInfo | null>(null);
  const [nexuses, setNexuses] = useState<NexusSummary[]>([]);
  const [referrerInput, setReferrerInput] = useState('');
  const [referrerError, setReferrerError] = useState('');
  const [referrerSubmitting, setReferrerSubmitting] = useState(false);
  const [myReferralCode, setMyReferralCode] = useState('');
  const [codeCopied, setCodeCopied] = useState(false);

  const [redeemState, setRedeemState] = useState<RedeemState | null>(null);
  const [redeemError, setRedeemError] = useState('');
  const [redeemSubmitting, setRedeemSubmitting] = useState(false);
  const [redeemSuccess, setRedeemSuccess] = useState('');

  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [referralsRes, pendingRes, referrerRes, codeRes, nexusRes] = await Promise.all([
        getMyReferrals(),
        getMyPendingTokens(),
        getMyReferrer(),
        getMyReferralCode(),
        getMyNexuses(),
      ]);
      setReferrals(referralsRes.data as ReferralRow[]);
      const pending = pendingRes.data as { referral: PendingToken[]; milestone: PendingToken[] };
      setPendingReferralTokens(pending.referral ?? []);
      setPendingMilestoneTokens(pending.milestone ?? []);
      setReferrer_((referrerRes.data as { referrer: ReferrerInfo | null }).referrer);
      setMyReferralCode((codeRes.data as { referralCode: string }).referralCode ?? '');
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

  const openRedeem = (tokenId: number, kind: TokenKind) => {
    setRedeemError('');
    setRedeemSuccess('');
    setRedeemState({
      tokenId,
      kind,
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
      const redeemFn = redeemState.kind === 'milestone' ? redeemMilestoneToken : redeemReferralToken;
      const res = await redeemFn(
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

  const totalPendingCount = pendingReferralTokens.length + pendingMilestoneTokens.length;

  if (loading) return <div className="referrals-loading">Loading...</div>;

  const redeemForm = (
    <form className="referrals-redeem-form" onSubmit={handleRedeem}>
      <label className="referrals-field">
        <span className="referrals-label">Nexus</span>
        <select
          value={redeemState?.nexusId}
          onChange={(e) => setRedeemState(s => s ? { ...s, nexusId: e.target.value } : s)}
          disabled={redeemSubmitting}
        >
          {nexuses.map((n) => (
            <option key={n.id} value={n.id}>{n.name} (CC {n.commandCore})</option>
          ))}
        </select>
      </label>

      <div className="referrals-reward-type-row">
        <label className={`referrals-reward-option ${redeemState?.rewardType === 'troop_grant' ? 'selected' : ''}`}>
          <input
            type="radio" name="rewardType" value="troop_grant"
            checked={redeemState?.rewardType === 'troop_grant'}
            onChange={() => setRedeemState(s => s ? { ...s, rewardType: 'troop_grant' } : s)}
          />
          Troop Grant
        </label>
        <label className={`referrals-reward-option ${redeemState?.rewardType === 'building_instant' ? 'selected' : ''}`}>
          <input
            type="radio" name="rewardType" value="building_instant"
            checked={redeemState?.rewardType === 'building_instant'}
            onChange={() => setRedeemState(s => s ? { ...s, rewardType: 'building_instant' } : s)}
          />
          Instant Building Level
        </label>
      </div>

      {redeemState?.rewardType === 'troop_grant' && (
        <label className="referrals-field">
          <span className="referrals-label">Troop Type</span>
          <select
            value={redeemState.troopType}
            onChange={(e) => setRedeemState(s => s ? { ...s, troopType: e.target.value } : s)}
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

      {redeemState?.rewardType === 'building_instant' && (
        <label className="referrals-field">
          <span className="referrals-label">Building to Level Up</span>
          <select
            value={redeemState.building}
            onChange={(e) => setRedeemState(s => s ? { ...s, building: e.target.value } : s)}
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
        <button type="submit" className="referrals-btn primary" disabled={redeemSubmitting || !redeemState?.nexusId}>
          {redeemSubmitting ? 'Redeeming...' : 'Redeem Token'}
        </button>
      </div>
    </form>
  );

  return (
    <div className="referrals-tab">

      {/* Milestone token — everyone gets 1 at 500 pts */}
      {pendingMilestoneTokens.length > 0 && (
        <section className="referrals-section">
          <h3 className="referrals-section-title">
            Milestone Reward
            <span className="referrals-count-badge">{pendingMilestoneTokens.length}</span>
          </h3>
          <p className="referrals-hint">
            You reached {MILESTONE_THRESHOLD} influence points. Claim your reward token.
          </p>
          {redeemSuccess && !redeemState && <div className="referrals-success">{redeemSuccess}</div>}
          {redeemState?.kind === 'milestone' ? redeemForm : (
            <div className="referrals-token-list">
              {pendingMilestoneTokens.map((t) => (
                <div key={t.id} className="referrals-token-card">
                  <div className="referrals-token-info">
                    <span className="referrals-token-label">500 Influence Milestone</span>
                    <span className="referrals-token-meta">One-time reward for reaching {MILESTONE_THRESHOLD} pts</span>
                  </div>
                  <button className="referrals-btn primary" onClick={() => openRedeem(t.id, 'milestone')}>
                    Claim
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Your referral code — account-bound, unique across galaxies */}
      {myReferralCode && (
        <section className="referrals-section">
          <h3 className="referrals-section-title">Your Referral Code</h3>
          <p className="referrals-hint">
            Share this code with friends. It is tied to your account across every galaxy.
          </p>
          <div className="referrals-referrer-card">
            <span className="referrals-referrer-name" style={{ fontFamily: 'monospace', letterSpacing: '0.1em' }}>
              {myReferralCode}
            </span>
            <button
              type="button"
              className="referrals-btn primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(myReferralCode);
                  setCodeCopied(true);
                  setTimeout(() => setCodeCopied(false), 1500);
                } catch {
                  // clipboard unavailable
                }
              }}
            >
              {codeCopied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </section>
      )}

      {/* Referrer section — who referred you */}
      <section className="referrals-section">
        <h3 className="referrals-section-title">Referred By</h3>
        {referrer ? (
          <div className="referrals-referrer-card">
            <span className="referrals-referrer-name">{referrer.username}</span>
            {referrer.thresholdMet ? (
              <span className="referrals-badge referrals-badge--done">Their reward unlocked</span>
            ) : (
              <span className="referrals-badge referrals-badge--progress">
                In progress
              </span>
            )}
          </div>
        ) : (
          <form className="referrals-referrer-form" onSubmit={handleSetReferrer}>
            <p className="referrals-hint">
              Did someone invite you? Enter their username. Once you reach {REFERRAL_THRESHOLD} influence points, they earn 2 reward tokens. This can only be set once.
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

        {/* Show the referee's own progress toward unlocking the referral reward */}
        {referrer && !referrer.thresholdMet && (
          <div>
            <div className="referrals-progress-bar-wrap" style={{ marginTop: 10 }}>
              <div
                className="referrals-progress-bar"
                style={{ width: `${Math.min(100, ((referrer.myPoints ?? 0) / REFERRAL_THRESHOLD) * 100)}%` }}
              />
            </div>
            <span className="referrals-progress-label">
              Your progress: {Math.min(referrer.myPoints ?? 0, REFERRAL_THRESHOLD)} / {REFERRAL_THRESHOLD} pts to unlock their reward
            </span>
          </div>
        )}
      </section>

      {/* Pending referral redemptions (earned by inviting others) */}
      {pendingReferralTokens.length > 0 && (
        <section className="referrals-section">
          <h3 className="referrals-section-title">
            Referral Tokens
            <span className="referrals-count-badge">{pendingReferralTokens.length}</span>
          </h3>
          <p className="referrals-hint">Someone you referred reached {REFERRAL_THRESHOLD} influence points. Each token is a one-time reward.</p>
          {redeemSuccess && !redeemState && <div className="referrals-success">{redeemSuccess}</div>}
          {redeemState?.kind === 'referral' ? redeemForm : (
            <div className="referrals-token-list">
              {pendingReferralTokens.map((t) => {
                const row = referrals.find((r) => r.tokenId === t.id);
                return (
                  <div key={t.id} className="referrals-token-card">
                    <div className="referrals-token-info">
                      <span className="referrals-token-label">Referral token</span>
                      {row && <span className="referrals-token-meta">{row.refereeUsername} reached {REFERRAL_THRESHOLD} pts</span>}
                    </div>
                    <button className="referrals-btn primary" onClick={() => openRedeem(t.id, 'referral')}>
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
            No referrals yet. Tell players to enter your username in the Referred By field when they join.
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
                      <span className="referrals-badge referrals-badge--done">Claimed</span>
                    ) : r.thresholdMet ? (
                      <span className="referrals-badge referrals-badge--ready">Token ready</span>
                    ) : null}
                  </div>
                </div>
                <div className="referrals-progress-bar-wrap">
                  <div
                    className="referrals-progress-bar"
                    style={{ width: `${Math.min(100, (r.refereePoints / REFERRAL_THRESHOLD) * 100)}%` }}
                  />
                </div>
                <span className="referrals-progress-label">
                  {Math.min(r.refereePoints, REFERRAL_THRESHOLD)} / {REFERRAL_THRESHOLD} pts
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
