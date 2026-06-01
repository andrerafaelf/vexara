'use client';

import { Building2, MapPin, Shield, Swords, Trophy, Users, X, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../styles/WhileYouWereAway.css';
import { getActivitySummary } from '../services/api';
import { serverNow } from '../realtime/serverClock';

const LAST_VISIT_KEY = 'wywa_last_visit';
// Don't summarize further back than this, even if the stored visit is ancient
// (or absent). Keeps the "Last X of activity" label honest and stops a
// long-absent player from being shown weeks of stale battles as if they just
// happened. Mirrors the server's own lookback expectations.
const MAX_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000;
// Below this, there's nothing worth interrupting the player for — treat it as
// "just reloaded the page" rather than "returned from being away".
const MIN_AWAY_MS = 10 * 60 * 1000;

interface AttackSummary {
	id: number;
	type: string;
	isMyAttack: boolean;
	attackerNexus?: string;
	defenderNexus?: string;
	result?: string;
	completedAt: string;
}

interface BuildingSummary {
	nexusName: string;
	building: string;
	level: number;
}

interface TroopSummary {
	nexusName: string;
	type: string;
	count: number;
}

interface FactionWarSummary {
	id: number;
	status: string;
	declaredAt: string;
	declarerFaction: string;
	targetFaction: string;
}

interface NearbyConquestSummary {
	defenderNexus: string;
	attackerNexus: string;
	x?: number;
	y?: number;
}

interface ActivityData {
	attacks: AttackSummary[];
	buildings: BuildingSummary[];
	troops: TroopSummary[];
	factionWars?: FactionWarSummary[];
	nearbyConquests?: NearbyConquestSummary[];
	rank?: { rank: number; points: number };
	since: string;
}

const BUILDING_LABELS: Record<string, string> = {
	commandCore: 'Command Core',
	recruitmentCore: 'Recruitment Core',
	lifeSupport: 'Life Support',
	storageVault: 'Storage Vault',
	biomassFarm: 'Biomass Farm',
	alloyForge: 'Alloy Forge',
	oreExtractor: 'Ore Extractor',
	shieldGrid: 'Shield Grid'
};

const TROOP_LABELS: Record<string, string> = {
	lancerDrone: 'Lancer Drone',
	assaultTrooper: 'Assault Trooper',
	breakerUnit: 'Breaker Unit',
	reconOperative: 'Recon Operative',
	skimmerBike: 'Skimmer Bike',
	siegeMech: 'Siege Mech',
	bulwarkGuard: 'Bulwark Guard',
	suppressorTeam: 'Suppressor Team',
	disruptorUnit: 'Disruptor Unit',
	interceptorBike: 'Interceptor Bike',
	annihilatorPlatform: 'Annihilator Platform',
	overseer: 'Overseer'
};

function formatDuration(since: string) {
	const ms = Math.max(0, serverNow() - new Date(since).getTime());
	const h = Math.floor(ms / 3600000);
	const d = Math.floor(h / 24);
	if (d >= 2) return `${d} days`;
	if (h >= 1) return `${h}h`;
	const m = Math.floor(ms / 60000);
	if (m >= 2) return `${m} minutes`;
	return 'a few minutes';
}

function resultLabel(result: string | undefined, isMyAttack: boolean) {
	if (!result) return '';
	// Server encodes result from the attacker's perspective:
	//   'victory' = attacker won, 'defeat' = attacker lost.
	// We map to a viewer-friendly label:
	//   attacker + victory  → "Victory"
	//   attacker + defeat   → "Defeat"
	//   defender + victory  → "Defeated"  (they won, I lost)
	//   defender + defeat   → "Repelled"  (they lost, I won)
	const attackerWon = result === 'victory';
	if (isMyAttack) return attackerWon ? 'Victory' : 'Defeat';
	return attackerWon ? 'Defeated' : 'Repelled';
}

function resultClass(result: string | undefined, isMyAttack: boolean) {
	if (!result) return '';
	// Good outcome: I attacked and won, or I defended and repelled them.
	const attackerWon = result === 'victory';
	const iGoodOutcome = (isMyAttack && attackerWon) || (!isMyAttack && !attackerWon);
	return iGoodOutcome ? 'wywa-result--win' : 'wywa-result--loss';
}

interface Props {
	onDismiss: () => void;
}

export default function WhileYouWereAway({ onDismiss }: Props) {
	const [data, setData] = useState<ActivityData | null>(null);
	const [loading, setLoading] = useState(true);

	// The displayed window (`data.since`) must match what we actually queried, so
	// we compute a single `since` up front and reuse it both for the request and
	// the label. Falling back to a 24h-ago server default (the old behaviour) made
	// every first-load show "1 day of activity" regardless of how long the player
	// was really away.
	useEffect(() => {
		if (typeof window === 'undefined') {
			setLoading(false);
			return;
		}

		const stored = localStorage.getItem(LAST_VISIT_KEY);
		const now = Date.now();

		// First time this browser ever opens the game: there's no "away" period to
		// summarize. Stamp the visit and stay silent (matches the NewPatchToast
		// first-visitor pattern). Without this, a brand-new player is greeted by a
		// misleading "while you were away" the very first time they log in.
		if (!stored) {
			try {
				localStorage.setItem(LAST_VISIT_KEY, new Date(now).toISOString());
			} catch {
				/* ignore */
			}
			setLoading(false);
			onDismiss();
			return;
		}

		const lastVisitMs = new Date(stored).getTime();
		const awayMs = Number.isFinite(lastVisitMs) ? now - lastVisitMs : MAX_LOOKBACK_MS;

		// Just reloaded / bounced between pages — nothing to report.
		if (awayMs < MIN_AWAY_MS) {
			try {
				localStorage.setItem(LAST_VISIT_KEY, new Date(now).toISOString());
			} catch {
				/* ignore */
			}
			setLoading(false);
			onDismiss();
			return;
		}

		// Clamp the lookback so an ancient/garbage timestamp can't surface weeks of
		// stale combat as if it just happened.
		const sinceMs = Math.max(lastVisitMs, now - MAX_LOOKBACK_MS);
		const since = new Date(sinceMs).toISOString();

		getActivitySummary(since)
			.then((r: any) => setData(r.data as ActivityData))
			.catch(() => setData(null))
			.finally(() => setLoading(false));
	}, [onDismiss]);

	const handleDismiss = () => {
		if (typeof window !== 'undefined') {
			try {
				localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
			} catch {
				/* ignore */
			}
		}
		onDismiss();
	};

	if (loading) return null;
	if (!data) return null;

	const factionWars = data.factionWars ?? [];
	const nearbyConquests = data.nearbyConquests ?? [];
	const hasAnything =
		data.attacks.length > 0 ||
		data.buildings.length > 0 ||
		data.troops.length > 0 ||
		factionWars.length > 0 ||
		nearbyConquests.length > 0;
	if (!hasAnything) {
		handleDismiss();
		return null;
	}

	const wins = data.attacks.filter((a) => {
		const attackerWon = a.result === 'victory';
		return (a.isMyAttack && attackerWon) || (!a.isMyAttack && !attackerWon);
	}).length;
	const losses = data.attacks.length - wins;

	return (
		<div className="wywa-overlay" role="dialog" aria-modal="true" aria-label="Activity summary">
			<div className="wywa-modal">
				<div className="wywa-header">
					<div className="wywa-header-text">
						<span className="wywa-title">While You Were Away</span>
						<span className="wywa-subtitle">Last {formatDuration(data.since)} of activity</span>
					</div>
					<button className="wywa-close" onClick={handleDismiss} aria-label="Dismiss">
						<X size={18} />
					</button>
				</div>

				<div className="wywa-body">
					{data.attacks.length > 0 && (
						<section className="wywa-section">
							<div className="wywa-section-header">
								<Swords size={15} />
								<span>
									Combat ({data.attacks.length} battle{data.attacks.length !== 1 ? 's' : ''})
								</span>
								<span className="wywa-combat-tally">
									{wins > 0 && (
										<span className="wywa-tally--win">
											<Trophy size={12} /> {wins}
										</span>
									)}
									{losses > 0 && (
										<span className="wywa-tally--loss">
											<Shield size={12} /> {losses}
										</span>
									)}
								</span>
							</div>
							<ul className="wywa-list">
								{data.attacks.map((a) => (
									<li key={a.id} className="wywa-attack-row">
										<span className="wywa-attack-nexuses">
											<strong>{a.attackerNexus ?? '?'}</strong>
											<span className="wywa-arrow">→</span>
											<strong>{a.defenderNexus ?? '?'}</strong>
										</span>
										{a.result && (
											<span className={`wywa-result ${resultClass(a.result, a.isMyAttack)}`}>
												{resultLabel(a.result, a.isMyAttack)}
											</span>
										)}
									</li>
								))}
							</ul>
						</section>
					)}

					{data.buildings.length > 0 && (
						<section className="wywa-section">
							<div className="wywa-section-header">
								<Building2 size={15} />
								<span>Buildings completed ({data.buildings.length})</span>
							</div>
							<ul className="wywa-list">
								{data.buildings.map((b, i) => (
									<li key={i} className="wywa-item-row">
										<span className="wywa-item-label">
											{BUILDING_LABELS[b.building] ?? b.building}
										</span>
										<span className="wywa-item-meta">
											{b.nexusName} &mdash; Lv {b.level}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}

					{data.troops.length > 0 && (
						<section className="wywa-section">
							<div className="wywa-section-header">
								<Users size={15} />
								<span>Troops trained ({data.troops.reduce((s, t) => s + t.count, 0)})</span>
							</div>
							<ul className="wywa-list">
								{data.troops.map((t, i) => (
									<li key={i} className="wywa-item-row">
										<span className="wywa-item-label">{TROOP_LABELS[t.type] ?? t.type}</span>
										<span className="wywa-item-meta">
											{t.nexusName} &mdash; +{t.count}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}

					{factionWars.length > 0 && (
						<section className="wywa-section">
							<div className="wywa-section-header">
								<Zap size={15} />
								<span>
									Faction war{factionWars.length !== 1 ? 's' : ''} ({factionWars.length})
								</span>
							</div>
							<ul className="wywa-list">
								{factionWars.map((w) => (
									<li key={w.id} className="wywa-item-row">
										<span className="wywa-item-label">
											{w.declarerFaction} declared war on {w.targetFaction}
										</span>
										<span
											className={`wywa-result ${w.status === 'active' ? 'wywa-result--loss' : ''}`}
										>
											{w.status}
										</span>
									</li>
								))}
							</ul>
						</section>
					)}

					{nearbyConquests.length > 0 && (
						<section className="wywa-section">
							<div className="wywa-section-header">
								<MapPin size={15} />
								<span>Nearby conquests ({nearbyConquests.length})</span>
							</div>
							<ul className="wywa-list">
								{nearbyConquests.map((c, i) => (
									<li key={i} className="wywa-item-row">
										<span className="wywa-item-label">
											{c.defenderNexus} conquered by {c.attackerNexus}
										</span>
										{c.x != null && c.y != null && (
											<span className="wywa-item-meta">
												{c.x}|{c.y}
											</span>
										)}
									</li>
								))}
							</ul>
						</section>
					)}

					{data.rank && (
						<section className="wywa-section wywa-section--rank">
							<div className="wywa-section-header">
								<Trophy size={15} />
								<span>Your rank</span>
							</div>
							<p className="wywa-rank-line">
								#{data.rank.rank} &mdash; {data.rank.points.toLocaleString()} influence
							</p>
						</section>
					)}
				</div>

				<div className="wywa-footer">
					<button className="wywa-dismiss-btn" onClick={handleDismiss}>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}
