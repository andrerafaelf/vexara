'use client';

import { useEffect, useState } from 'react';
import { useToast } from '../context/ToastContext';
import {
	getMyNexuses,
	getMyPendingTokens,
	getMyReferralCode,
	getMyReferrals,
	getMyReferrer,
	redeemMilestoneToken,
	redeemReferralToken
} from '../services/api';
import '../styles/ReferralsTab.css';
import Username from './Username';

const REFERRAL_THRESHOLD = 1000;
const REFERRAL_EARLY_THRESHOLD = 100;
const MILESTONE_THRESHOLD = 500;

const TROOP_LABELS: Record<string, string> = {
	sentinelLancer: 'Sentinel Lancer',
	assaultTrooper: 'Assault Trooper',
	vanguardBreaker: 'Vanguard Breaker',
	reconOperative: 'Recon Operative',
	wraithSkimmer: 'Wraith Skimmer',
	bulwarkGuard: 'Bulwark Guard',
	pyreSuppressor: 'Pyre Suppressor',
	arcDisruptor: 'Arc Disruptor',
	phantomLance: 'Phantom Lance',
	siegeMech: 'Siege Mech',
	annihilatorPlatform: 'Annihilator Platform'
};

const TROOP_KEYS = Object.keys(TROOP_LABELS);

const BUILDING_LABELS: Record<string, string> = {
	commandCore: 'Command Core',
	hangarBay: 'Hangar Bay',
	plasmaForge: 'Plasma Forge',
	armorFoundry: 'Armor Foundry',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid',
	targetingCore: 'Targeting Core',
	stealthArray: 'Stealth Array'
};

const BUILDING_KEYS = Object.keys(BUILDING_LABELS);

const TROOP_GRANTS: Record<string, [number, number, number, number]> = {
	sentinelLancer: [35, 75, 120, 180],
	vanguardBreaker: [35, 75, 120, 180],
	assaultTrooper: [20, 45, 75, 110],
	reconOperative: [20, 45, 75, 110],
	bulwarkGuard: [15, 32, 50, 75],
	pyreSuppressor: [15, 32, 50, 75],
	wraithSkimmer: [12, 25, 40, 60],
	arcDisruptor: [12, 25, 40, 60],
	phantomLance: [12, 25, 40, 60],
	siegeMech: [5, 12, 20, 30],
	annihilatorPlatform: [2, 5, 10, 15]
};

const TROOP_POPULATION: Record<string, number> = {
	sentinelLancer: 1,
	assaultTrooper: 1,
	vanguardBreaker: 1,
	reconOperative: 1,
	pyreSuppressor: 2,
	wraithSkimmer: 3,
	bulwarkGuard: 2,
	arcDisruptor: 2,
	phantomLance: 3,
	siegeMech: 4,
	annihilatorPlatform: 5
};

function ccTier(level: number): 0 | 1 | 2 | 3 {
	if (level <= 4) return 0;
	if (level <= 8) return 1;
	if (level <= 12) return 2;
	return 3;
}

interface RefereeRow {
	refereeId: number;
	refereeUsername: string;
	refereePoints: number;
	thresholdMet: boolean;
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
	refereeId?: number;
	userId?: number;
	milestone?: number;
	rewardType?: string | null;
	rewardMeta?: Record<string, unknown> | null;
	kofiTransactionId?: string | null;
}

interface ReferrerInfo {
	username: string;
	isSupporter?: boolean;
	supporterTier?: string | null;
	thresholdMet: boolean;
	referrerPoints: number;
	myPoints: number;
}

const BUILDING_MAX: Record<string, number> = {
	commandCore: 20,
	hangarBay: 20,
	plasmaForge: 20,
	armorFoundry: 20,
	lifeSupport: 25,
	storageVault: 20,
	biomassFarm: 20,
	alloyForge: 20,
	oreExtractor: 20,
	shieldGrid: 15,
	targetingCore: 20,
	stealthArray: 15
};

const BUILDING_UNLOCK: Record<string, { building: string; level: number }> = {
	hangarBay: { building: 'commandCore', level: 2 },
	plasmaForge: { building: 'commandCore', level: 2 },
	armorFoundry: { building: 'commandCore', level: 2 },
	lifeSupport: { building: 'commandCore', level: 2 },
	storageVault: { building: 'commandCore', level: 2 },
	biomassFarm: { building: 'lifeSupport', level: 1 },
	alloyForge: { building: 'oreExtractor', level: 2 },
	oreExtractor: { building: 'commandCore', level: 1 },
	shieldGrid: { building: 'commandCore', level: 3 },
	targetingCore: { building: 'commandCore', level: 5 },
	stealthArray: { building: 'commandCore', level: 7 }
};

interface NexusSummary {
	id: string;
	name: string;
	commandCore: number;
	populationCurrent: number;
	populationMax: number;
	buildings: Record<string, number>;
}

type RewardType = 'building_instant' | 'troop_grant';
type TokenKind = 'referral' | 'milestone';
type ReferralsTabMode = 'referrals' | 'tokens';

interface RedeemState {
	tokenId: number;
	kind: TokenKind;
	rewardType: RewardType;
	nexusId: string;
	building: string;
	troopType: string;
}

interface ReferralsTabProps {
	mode?: ReferralsTabMode;
}

const ADMIN_REASON_COPY: Record<string, { label: string; meta: string }> = {
	manual: { label: 'Manual Grant', meta: 'Token granted by Vexara staff' },
	admin_grant: { label: 'Manual Grant', meta: 'Token granted by Vexara staff' },
	compensation: { label: 'Compensation', meta: 'Token granted as compensation' },
	contest: { label: 'Contest Reward', meta: 'Token earned through a contest reward' },
	supporter: { label: 'Supporter Bonus', meta: 'Token granted as a supporter bonus' },
	bug_fix: { label: 'Bug Fix / Make-good', meta: 'Token granted as a make-good' },
	downtime_2026_05_23: {
		label: 'Downtime Compensation',
		meta: 'Token granted for the May 23 downtime'
	}
};

function prettifyReason(reason: string): string {
	return reason
		.replace(/[_-]+/g, ' ')
		.trim()
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getTokenDisplay(token: PendingToken): { label: string; meta: string } {
	const reason = typeof token.rewardMeta?.reason === 'string' ? token.rewardMeta.reason.trim() : '';
	const reasonCopy = reason ? ADMIN_REASON_COPY[reason] : null;

	if (token.rewardType === 'kofi') {
		return { label: 'Supporter Reward', meta: 'Token earned through Ko-fi support' };
	}

	if (token.rewardType === 'admin' || token.kofiTransactionId?.startsWith('admin-')) {
		if (reasonCopy) return reasonCopy;
		if (reason) return { label: prettifyReason(reason), meta: `Granted: ${reason}` };
		return ADMIN_REASON_COPY.admin_grant;
	}

	if (reasonCopy) return reasonCopy;
	if (reason) return { label: prettifyReason(reason), meta: `Granted: ${reason}` };
	if (token.kofiTransactionId)
		return { label: 'Supporter Reward', meta: 'Token earned through Ko-fi support' };
	return { label: 'Bonus Token', meta: 'One-time reward token' };
}

export default function ReferralsTab({ mode = 'referrals' }: ReferralsTabProps) {
	const [refereeRows, setRefereeRows] = useState<RefereeRow[]>([]);
	const [referrals, setReferrals] = useState<ReferralRow[]>([]);
	const [pendingReferralTokens, setPendingReferralTokens] = useState<PendingToken[]>([]);
	const [pendingMilestoneTokens, setPendingMilestoneTokens] = useState<PendingToken[]>([]);
	const [referrer, setReferrer_] = useState<ReferrerInfo | null>(null);
	const [nexuses, setNexuses] = useState<NexusSummary[]>([]);
	const [myReferralCode, setMyReferralCode] = useState('');
	const [myReferralClicks, setMyReferralClicks] = useState(0);
	const [copied, setCopied] = useState<'link' | 'post' | 'code' | null>(null);

	const [redeemState, setRedeemState] = useState<RedeemState | null>(null);
	const [redeemError, setRedeemError] = useState('');
	const [redeemSubmitting, setRedeemSubmitting] = useState(false);
	const toast = useToast();

	const [loading, setLoading] = useState(true);

	const load = async () => {
		try {
			const [referralsRes, pendingRes, referrerRes, codeRes, nexusRes] = await Promise.all([
				getMyReferrals(),
				getMyPendingTokens(),
				getMyReferrer(),
				getMyReferralCode(),
				getMyNexuses()
			]);
			const referralsData = referralsRes.data as { referees: RefereeRow[]; tokens: ReferralRow[] };
			setRefereeRows(referralsData.referees ?? []);
			setReferrals(referralsData.tokens ?? []);
			const pending = pendingRes.data as { referral: PendingToken[]; milestone: PendingToken[] };
			setPendingReferralTokens(pending.referral ?? []);
			setPendingMilestoneTokens(pending.milestone ?? []);
			setReferrer_((referrerRes.data as { referrer: ReferrerInfo | null }).referrer);
			const codeData = codeRes.data as { referralCode: string; referralClickCount?: number };
			setMyReferralCode(codeData.referralCode ?? '');
			setMyReferralClicks(codeData.referralClickCount ?? 0);
			const mappedNexuses: NexusSummary[] = (nexusRes.data as any[]).map((n: any) => ({
				id: String(n.id),
				name: n.name,
				commandCore: n.buildings?.commandCore ?? n.commandCore ?? 0,
				populationCurrent: n.population?.current ?? n.populationCurrent ?? 0,
				populationMax: n.population?.max ?? n.populationMax ?? 24,
				buildings: n.buildings ?? {}
			}));
			setNexuses(mappedNexuses);
		} catch {
			// non-critical
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		void load();
	}, []);

	const origin =
		typeof window !== 'undefined' ? window.location.origin : 'https://vexara.world';
	const inviteLink = myReferralCode ? `${origin}/register?ref=${myReferralCode}` : '';
	const recruitmentPost = `Come command an empire in Vexara, a free browser MMO RTS. No download, no account wipes. New commanders who join with my invite start with a bonus troop squad. Join with my invite: ${origin}/register?ref=${myReferralCode}&utm_source=referral&utm_medium=player&utm_campaign=recruitment_orders`;

	const copyToClipboard = async (text: string, which: 'link' | 'post' | 'code') => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(which);
			setTimeout(() => setCopied((c) => (c === which ? null : c)), 2000);
		} catch {
			// clipboard unavailable — silently ignore
		}
	};

	const openRedeem = (tokenId: number, kind: TokenKind) => {
		setRedeemError('');
		setRedeemState({
			tokenId,
			kind,
			rewardType: 'troop_grant',
			nexusId: nexuses[0]?.id ?? '',
			building: BUILDING_KEYS[0],
			troopType: TROOP_KEYS[0]
		});
	};

	const handleRedeem = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!redeemState) return;
		setRedeemError('');
		setRedeemSubmitting(true);
		try {
			const redeemFn =
				redeemState.kind === 'milestone' ? redeemMilestoneToken : redeemReferralToken;
			const res = await redeemFn(
				redeemState.tokenId,
				redeemState.rewardType,
				parseInt(redeemState.nexusId, 10),
				redeemState.rewardType === 'building_instant'
					? { building: redeemState.building }
					: { troopType: redeemState.troopType }
			);
			toast((res.data as any).message, 'success');
			setRedeemState(null);
			await load();
		} catch (err) {
			setRedeemError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					'Redemption failed'
			);
		} finally {
			setRedeemSubmitting(false);
		}
	};

	const selectedNexus = nexuses.find((n) => n.id === redeemState?.nexusId);
	const ccLevel = selectedNexus?.commandCore ?? 0;
	const tier = ccTier(ccLevel);
	const troopGrantFull = redeemState ? (TROOP_GRANTS[redeemState.troopType]?.[tier] ?? 0) : 0;
	const popFree = selectedNexus
		? Math.max(0, selectedNexus.populationMax - selectedNexus.populationCurrent)
		: 0;
	const popPerUnit = redeemState ? (TROOP_POPULATION[redeemState.troopType] ?? 1) : 1;
	const troopGrantPreview = Math.min(troopGrantFull, Math.floor(popFree / popPerUnit));

	const upgradeableBuildings = BUILDING_KEYS.filter((b) => {
		const current = selectedNexus?.buildings[b] ?? 0;
		if (current >= (BUILDING_MAX[b] ?? 20)) return false;
		const unlock = BUILDING_UNLOCK[b];
		if (unlock && (selectedNexus?.buildings[unlock.building] ?? 0) < unlock.level) return false;
		return true;
	});

	// Keep the selected building valid when the nexus changes or the current pick maxes out.
	// Without this, the select shows a fallback value but redeemState.building still points
	// at e.g. a max-level Command Core, causing the server to reject the redemption.
	useEffect(() => {
		if (!redeemState || redeemState.rewardType !== 'building_instant') return;
		if (upgradeableBuildings.length === 0) return;
		if (!upgradeableBuildings.includes(redeemState.building)) {
			setRedeemState((s) => (s ? { ...s, building: upgradeableBuildings[0] } : s));
		}
	}, [
		redeemState?.nexusId,
		redeemState?.rewardType,
		redeemState?.building,
		upgradeableBuildings.join(',')
	]);

	if (loading) return null;

	const pointMilestoneTokens = pendingMilestoneTokens.filter((t) => (t.milestone ?? 0) > 0);
	const bonusTokens = pendingMilestoneTokens.filter((t) => (t.milestone ?? 0) <= 0);
	const isRedeemingPointMilestone =
		redeemState?.kind === 'milestone' &&
		pointMilestoneTokens.some((t) => t.id === redeemState.tokenId);
	const isRedeemingBonus =
		redeemState?.kind === 'milestone' && bonusTokens.some((t) => t.id === redeemState.tokenId);
	const isRedeemingReferral =
		redeemState?.kind === 'referral' &&
		pendingReferralTokens.some((t) => t.id === redeemState.tokenId);

	const redeemForm = (
		<form className="referrals-redeem-form" onSubmit={handleRedeem}>
			<label className="referrals-field">
				<span className="referrals-label">Nexus</span>
				<select
					value={redeemState?.nexusId}
					onChange={(e) => setRedeemState((s) => (s ? { ...s, nexusId: e.target.value } : s))}
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
				<label
					className={`referrals-reward-option ${redeemState?.rewardType === 'troop_grant' ? 'selected' : ''}`}
				>
					<input
						type="radio"
						name="rewardType"
						value="troop_grant"
						checked={redeemState?.rewardType === 'troop_grant'}
						onChange={() => setRedeemState((s) => (s ? { ...s, rewardType: 'troop_grant' } : s))}
					/>
					Troop Grant
				</label>
				<label
					className={`referrals-reward-option ${redeemState?.rewardType === 'building_instant' ? 'selected' : ''}`}
				>
					<input
						type="radio"
						name="rewardType"
						value="building_instant"
						checked={redeemState?.rewardType === 'building_instant'}
						onChange={() =>
							setRedeemState((s) => (s ? { ...s, rewardType: 'building_instant' } : s))
						}
					/>
					Instant Building Level
				</label>
			</div>

			{redeemState?.rewardType === 'troop_grant' && (
				<label className="referrals-field">
					<span className="referrals-label">Troop Type</span>
					<select
						value={redeemState.troopType}
						onChange={(e) => setRedeemState((s) => (s ? { ...s, troopType: e.target.value } : s))}
						disabled={redeemSubmitting}
					>
						{TROOP_KEYS.map((t) => (
							<option key={t} value={t}>
								{TROOP_LABELS[t]}
							</option>
						))}
					</select>
					{selectedNexus &&
						(troopGrantPreview === 0 ? (
							<span className="referrals-error">
								Not enough population capacity, free up space or choose a different nexus.
							</span>
						) : troopGrantPreview < troopGrantFull ? (
							<span className="referrals-preview referrals-preview--warn">
								~{troopGrantPreview} of {troopGrantFull} units (CC {ccLevel}, tier {tier + 1}/4),
								limited by population capacity
							</span>
						) : (
							<span className="referrals-preview">
								~{troopGrantPreview} units (CC {ccLevel}, tier {tier + 1}/4)
							</span>
						))}
				</label>
			)}

			{redeemState?.rewardType === 'building_instant' && (
				<label className="referrals-field">
					<span className="referrals-label">Building to Level Up</span>
					{upgradeableBuildings.length === 0 ? (
						<span className="referrals-error">
							All buildings on this nexus are at max level. Choose a different nexus or switch to
							troop grant.
						</span>
					) : (
						<>
							<select
								value={
									upgradeableBuildings.includes(redeemState.building)
										? redeemState.building
										: upgradeableBuildings[0]
								}
								onChange={(e) =>
									setRedeemState((s) => (s ? { ...s, building: e.target.value } : s))
								}
								disabled={redeemSubmitting}
							>
								{upgradeableBuildings.map((b) => (
									<option key={b} value={b}>
										{BUILDING_LABELS[b]}
									</option>
								))}
							</select>
							<span className="referrals-preview">
								2 instant levels, no resource cost, no queue.
							</span>
						</>
					)}
				</label>
			)}

			{redeemError && <div className="referrals-error">{redeemError}</div>}

			<div className="referrals-redeem-actions">
				<button
					type="button"
					className="referrals-btn"
					onClick={() => setRedeemState(null)}
					disabled={redeemSubmitting}
				>
					Cancel
				</button>
				<button
					type="submit"
					className="referrals-btn primary"
					disabled={
						redeemSubmitting ||
						!redeemState?.nexusId ||
						(redeemState?.rewardType === 'building_instant' && upgradeableBuildings.length === 0) ||
						(redeemState?.rewardType === 'troop_grant' && troopGrantPreview === 0)
					}
				>
					{redeemSubmitting ? 'Redeeming...' : 'Redeem Token'}
				</button>
			</div>
		</form>
	);

	return (
		<div className="referrals-tab">
			{/* Milestone tokens (actual 500-pt milestone) */}
			{mode === 'tokens' && pointMilestoneTokens.length > 0 && (
				<section className="referrals-section">
					<h3 className="referrals-section-title">
						Milestone Reward
						<span className="referrals-count-badge">{pointMilestoneTokens.length}</span>
					</h3>
					<p className="referrals-hint">
						You reached {MILESTONE_THRESHOLD} influence points. Claim your reward token.
					</p>
					{isRedeemingPointMilestone ? (
						redeemForm
					) : (
						<div className="referrals-token-list">
							{pointMilestoneTokens.map((t) => (
								<div key={t.id} className="referrals-token-card">
									<div className="referrals-token-info">
										<span className="referrals-token-label">{t.milestone} Influence Milestone</span>
										<span className="referrals-token-meta">
											One-time reward for reaching {t.milestone} pts
										</span>
									</div>
									<button
										className="referrals-btn primary"
										onClick={() => openRedeem(t.id, 'milestone')}
									>
										Claim
									</button>
								</div>
							))}
						</div>
					)}
				</section>
			)}

			{/* Admin-granted / Ko-fi / bonus tokens */}
			{mode === 'tokens' && bonusTokens.length > 0 && (
				<section className="referrals-section">
					<h3 className="referrals-section-title">
						Bonus Reward
						<span className="referrals-count-badge">{bonusTokens.length}</span>
					</h3>
					<p className="referrals-hint">
						You have one-time tokens to redeem for instant building levels or free troops.
					</p>
					{isRedeemingBonus ? (
						redeemForm
					) : (
						<div className="referrals-token-list">
							{bonusTokens.map((t) => {
								const display = getTokenDisplay(t);
								return (
									<div key={t.id} className="referrals-token-card">
										<div className="referrals-token-info">
											<span className="referrals-token-label">{display.label}</span>
											<span className="referrals-token-meta">{display.meta}</span>
										</div>
										<button
											className="referrals-btn primary"
											onClick={() => openRedeem(t.id, 'milestone')}
										>
											Claim
										</button>
									</div>
								);
							})}
						</div>
					)}
				</section>
			)}

			{mode === 'tokens' &&
				pointMilestoneTokens.length === 0 &&
				bonusTokens.length === 0 &&
				pendingReferralTokens.length === 0 && (
					<section className="referrals-section">
						<h3 className="referrals-section-title">Tokens</h3>
						<p className="referrals-hint">No tokens waiting to redeem right now.</p>
					</section>
				)}

			{/* Your referral code, account-bound, unique across galaxies */}
			{mode === 'referrals' && myReferralCode && (
				<section className="referrals-section">
					{/* Hero invite card — the primary share surface */}
					<div className="referrals-hero">
						<div className="referrals-hero-glow" aria-hidden="true" />
						<div className="referrals-hero-head">
							<span className="referrals-hero-kicker">Recruit a Commander</span>
							<h3 className="referrals-hero-title">
								Bring an ally into the galaxy.
								<br />
								Both of you get rewarded.
							</h3>
							<p className="referrals-hero-sub">
								Every recruit who joins with your link starts with a{' '}
								<strong>bonus troop squad</strong> on their first nexus. You earn redeemable
								tokens as they grow.
							</p>
						</div>

						<div className="referrals-hero-link">
							<span className="referrals-hero-link-label">Your invite link</span>
							<div className="referrals-hero-link-row">
								<code className="referrals-hero-link-value">{inviteLink}</code>
								<button
									type="button"
									className="referrals-btn primary referrals-hero-copy"
									onClick={() => copyToClipboard(inviteLink, 'link')}
								>
									{copied === 'link' ? '✓ Copied' : 'Copy link'}
								</button>
							</div>
							<div className="referrals-hero-actions">
								<button
									type="button"
									className="referrals-btn"
									onClick={() => copyToClipboard(recruitmentPost, 'post')}
								>
									{copied === 'post' ? '✓ Post copied' : 'Copy recruitment post'}
								</button>
								<button
									type="button"
									className="referrals-btn"
									onClick={() => copyToClipboard(myReferralCode, 'code')}
								>
									{copied === 'code' ? '✓ Code copied' : `Code: ${myReferralCode}`}
								</button>
							</div>
						</div>

						<div className="referrals-hero-stats">
							<div className="referrals-hero-stat">
								<span className="referrals-hero-stat-num">{myReferralClicks}</span>
								<span className="referrals-hero-stat-label">Link clicks</span>
							</div>
							<div className="referrals-hero-stat">
								<span className="referrals-hero-stat-num">{refereeRows.length}</span>
								<span className="referrals-hero-stat-label">Recruits</span>
							</div>
							<div className="referrals-hero-stat">
								<span className="referrals-hero-stat-num">
									{refereeRows.filter((r) => r.thresholdMet).length}
								</span>
								<span className="referrals-hero-stat-label">Tokens unlocked</span>
							</div>
						</div>
					</div>

					{/* Reward ladder — what each side earns, as cards */}
					<div className="referrals-ladder">
						<div className="referrals-ladder-card referrals-ladder-card--them">
							<span className="referrals-ladder-tag referrals-ladder-tag--them">Your recruit</span>
							<span className="referrals-ladder-reward">Troop head start</span>
							<span className="referrals-ladder-desc">
								A starter squad on their first nexus (15 Recon, 10 Sentinel Lancers, 10 Assault
								Troopers), a milestone token at 500 points, and 250 Vex Points at 5,000 influence.
							</span>
						</div>
						<div className="referrals-ladder-card">
							<span className="referrals-ladder-tag">You · 100 pts</span>
							<span className="referrals-ladder-reward">Early Scout token</span>
							<span className="referrals-ladder-desc">
								They survive their first day — you earn 1 token for instant building levels or free
								troops.
							</span>
						</div>
						<div className="referrals-ladder-card">
							<span className="referrals-ladder-tag">You · 1,000 pts</span>
							<span className="referrals-ladder-reward">Commander&apos;s Cache</span>
							<span className="referrals-ladder-desc">
								They hit their stride — you earn 2 more tokens. Three tokens per recruit.
							</span>
						</div>
						<div className="referrals-ladder-card referrals-ladder-card--best">
							<span className="referrals-ladder-tag referrals-ladder-tag--best">Both · 5,000 pts</span>
							<span className="referrals-ladder-reward">+250 VP each</span>
							<span className="referrals-ladder-desc">
								When your recruit reaches 5,000 influence, you <strong>and</strong> they each get 250
								Vex Points — straight to your balance.
							</span>
						</div>
					</div>

					<p className="referrals-orders-note">
						Recruiting actively? Post your link in Discord for cosmetic recognition — First Wave,
						Founding Commander, War Week Veteran. Bragging rights only, never power.
					</p>
				</section>
			)}

			{/* Referrer section, read-only display of who referred you at signup */}
			{mode === 'referrals' && referrer && (
				<section className="referrals-section">
					<h3 className="referrals-section-title">Referred By</h3>
					<div className="referrals-referrer-card">
						<span className="referrals-referrer-name">
							<Username
								name={referrer.username}
								isSupporter={referrer.isSupporter}
								supporterTier={referrer.supporterTier as any}
							/>
						</span>
						{referrer.thresholdMet ? (
							<span className="referrals-badge referrals-badge--done">Their reward unlocked</span>
						) : (
							<span className="referrals-badge referrals-badge--progress">In progress</span>
						)}
					</div>

					{!referrer.thresholdMet && (
						<div>
							<div className="referrals-progress-bar-wrap" style={{ marginTop: 10 }}>
								<div
									className="referrals-progress-bar"
									style={{
										width: `${Math.min(100, ((referrer.myPoints ?? 0) / REFERRAL_THRESHOLD) * 100)}%`
									}}
								/>
							</div>
							<span className="referrals-progress-label">
								Your progress: {Math.min(referrer.myPoints ?? 0, REFERRAL_THRESHOLD)} /{' '}
								{REFERRAL_THRESHOLD} pts to unlock their reward
							</span>
						</div>
					)}
				</section>
			)}

			{/* Pending referral redemptions (earned by inviting others) */}
			{mode === 'tokens' && pendingReferralTokens.length > 0 && (
				<section className="referrals-section">
					<h3 className="referrals-section-title">
						Referral Tokens
						<span className="referrals-count-badge">{pendingReferralTokens.length}</span>
					</h3>
					<p className="referrals-hint">
						Someone you referred reached {REFERRAL_THRESHOLD} influence points. Each token is a
						one-time reward.
					</p>
					{isRedeemingReferral ? (
						redeemForm
					) : (
						<div className="referrals-token-list">
							{pendingReferralTokens.map((t) => {
								const row = referrals.find((r) => r.tokenId === t.id);
								return (
									<div key={t.id} className="referrals-token-card">
										<div className="referrals-token-info">
											<span className="referrals-token-label">Referral token</span>
											{row && (
												<span className="referrals-token-meta">
													{row.refereeUsername} reached {REFERRAL_THRESHOLD} pts
												</span>
											)}
										</div>
										<button
											className="referrals-btn primary"
											onClick={() => openRedeem(t.id, 'referral')}
										>
											Claim
										</button>
									</div>
								);
							})}
						</div>
					)}
				</section>
			)}

			{/* Referral list, who you've referred */}
			{mode === 'referrals' && (
				<section className="referrals-section">
					<h3 className="referrals-section-title">Your Referrals</h3>
					{refereeRows.length === 0 ? (
						<p className="referrals-hint">
							No referrals yet. Share your referral code so new players can enter it when they sign
							up.
						</p>
					) : (
						<ul className="referrals-list">
							{refereeRows.map((r) => {
								const earlyDone = r.refereePoints >= REFERRAL_EARLY_THRESHOLD;
								const mainDone = r.thresholdMet;
								return (
									<li key={r.refereeId} className="referrals-list-item">
										<div className="referrals-list-info">
											<span className="referrals-list-name">{r.refereeUsername}</span>
											<div className="referrals-list-meta">
												<span>{r.refereePoints} pts</span>
												{mainDone ? (
													<span className="referrals-badge referrals-badge--done">
														All tokens earned
													</span>
												) : earlyDone ? (
													<span className="referrals-badge referrals-badge--ready">
														Early Scout earned
													</span>
												) : null}
											</div>
										</div>
										<div className="referrals-progress-bar-wrap referrals-progress-bar-wrap--tiered">
											<div
												className="referrals-progress-bar"
												style={{
													width: `${Math.min(100, (r.refereePoints / REFERRAL_THRESHOLD) * 100)}%`
												}}
											/>
											<div
												className="referrals-progress-milestone"
												style={{
													left: `${(REFERRAL_EARLY_THRESHOLD / REFERRAL_THRESHOLD) * 100}%`
												}}
											/>
										</div>
										<span className="referrals-progress-label">
											{Math.min(r.refereePoints, REFERRAL_THRESHOLD)} / {REFERRAL_THRESHOLD} pts
											{!earlyDone && ` · ${REFERRAL_EARLY_THRESHOLD} for Early Scout`}
										</span>
									</li>
								);
							})}
						</ul>
					)}
				</section>
			)}
		</div>
	);
}
