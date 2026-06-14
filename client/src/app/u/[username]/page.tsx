'use client';

import Avatar from '@/components/Avatar';
import BackBar from '@/components/BackBar';
import GameLayout from '@/components/GameLayout';
import { usePageReady } from '@/components/NavigationProgress';
import PageSkeleton from '@/components/PageSkeleton';
import ProfileBadges from '@/components/ProfileBadges';
import Username from '@/components/Username';
import {
	acceptFriendRequest,
	cancelFriendRequest,
	declineFriendRequest,
	getPublicProfile,
	removeFriend,
	sendFriendRequest
} from '@/services/api';
import '@/styles/ProfileStats.css';
import type { SupporterTier } from '@/types/game';
import { Clock, Crown, MapPin, UserCheck, UserMinus, UserPlus } from 'lucide-react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';

// Translate a /pathname[?tab=...] into a human-readable origin label for the
// back button. Keeps the BackBar specific ("Back to Members") instead of
// generic ("Back"), so the user always knows where they're going.
function labelForFrom(from: string | null): string {
	if (!from) return 'Back';
	let path = from;
	let tab: string | null = null;
	const q = from.indexOf('?');
	if (q !== -1) {
		path = from.slice(0, q);
		const params = new URLSearchParams(from.slice(q + 1));
		tab = params.get('tab');
	}
	const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
	if (path === '/factions') return tab ? `Factions . ${titleCase(tab)}` : 'Factions';
	if (path === '/allies') return tab ? `Allies . ${titleCase(tab)}` : 'Allies';
	if (path === '/players') return 'Players';
	if (path === '/reports') return 'Reports';
	if (path === '/market') return 'Market';
	if (path === '/profile') return tab ? `Profile . ${titleCase(tab)}` : 'Profile';
	if (path.startsWith('/nexus/')) return tab ? `Nexus . ${titleCase(tab)}` : 'Nexus';
	if (path === '/starfield') return 'Starfield';
	return 'Back';
}

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
	isSelf: boolean;
	isSupporter: boolean;
	supporterTier?: SupporterTier | null;
	isFounder?: boolean;
	isAlphaFounder?: boolean;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
	createdAt: string;
	accountAgeDays: number;
	totalInfluence: number;
	bestSingleGalaxy: number;
	galaxiesWon: number;
	galaxiesPlayed: number;
	points: number;
	nexusCount: number;
	// Self-only operational intel — null when viewing another player's profile.
	totalTroops: number | null;
	combat: {
		attacksLaunched: number;
		attacksDefended: number;
		victories: number;
		defeats: number;
		troopsLost: number;
		troopsKilled: number;
		resourcesStolen: { biomass: number; alloy: number; ore: number };
		resourcesLost: { biomass: number; alloy: number; ore: number };
	};
	resources: {
		current: { biomass: number; alloy: number; ore: number };
		productionPerHour: { biomass: number; alloy: number; ore: number };
		avgPerDay: { biomass: number; alloy: number; ore: number };
	} | null;
	streak: { currentStreak: number; longestStreak: number } | null;
	nexuses: Array<{
		_id?: string;
		id?: number;
		name: string;
		x: number;
		y: number;
		nexusType?: string | null;
		points?: number;
	}>;
	galaxies: GalaxyEntry[];
	friendship: { status: FriendshipStatus; requestId?: number };
}

function fmt(n: number): string {
	if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
	if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
	return String(Math.round(n));
}

function getStreakMultiplier(streak: number): number {
	const bonuses = [1, 1, 1.1, 1.2, 1.3, 1.5, 1.75, 2.0];
	return bonuses[Math.min(streak, bonuses.length - 1)];
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

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<div className="ps-section">
			<h3 className="ps-section-title">{title}</h3>
			<div className="ps-section-body">{children}</div>
		</div>
	);
}

function PublicProfilePageInner() {
	const params = useParams();
	const router = useRouter();
	const searchParams = useSearchParams();
	const username = decodeURIComponent(String(params.username || ''));

	// Captured once at mount: prevents the back target from flickering if some
	// child component happens to mutate query params while the page is open.
	const [fromAtMount] = useState<string | null>(() => searchParams?.get('from') ?? null);
	const backFallback = useMemo(() => fromAtMount ?? '/players', [fromAtMount]);
	const backLabel = useMemo(() => labelForFrom(fromAtMount), [fromAtMount]);

	const [profile, setProfile] = useState<PublicProfile | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [friendBusy, setFriendBusy] = useState(false);

	usePageReady(!loading, 'public-profile');

	const load = useCallback(() => {
		setLoading(true);
		getPublicProfile(username)
			.then((res) => {
				setProfile(res.data);
				setError(null);
			})
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
				<BackBar fallback={backFallback} fallbackLabel={backLabel} />
				<PageSkeleton variant="rows" count={5} />
			</GameLayout>
		);
	}

	if (error || !profile) {
		return (
			<GameLayout activePage="profile">
				<BackBar fallback={backFallback} fallbackLabel={backLabel} />
				<div className="profile-stats">
					<div className="ps-error">{error || 'User not found'}</div>
				</div>
			</GameLayout>
		);
	}

	const fs = profile.friendship;
	const winRate =
		profile.combat.victories + profile.combat.defeats > 0
			? Math.round(
					(profile.combat.victories / (profile.combat.victories + profile.combat.defeats)) * 100
				)
			: 0;
	const kd =
		profile.combat.troopsLost > 0
			? (profile.combat.troopsKilled / profile.combat.troopsLost).toFixed(2)
			: profile.combat.troopsKilled > 0
				? 'inf'
				: '.';
	const totalStolen =
		profile.combat.resourcesStolen.biomass +
		profile.combat.resourcesStolen.alloy +
		profile.combat.resourcesStolen.ore;
	const totalLost =
		profile.combat.resourcesLost.biomass +
		profile.combat.resourcesLost.alloy +
		profile.combat.resourcesLost.ore;

	return (
		<GameLayout activePage="profile">
			<BackBar fallback={backFallback} fallbackLabel={backLabel} />
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
							{/* Badges live in their own section below, not the header. */}
							<Username
								name={profile.username}
								isSupporter={profile.isSupporter}
								supporterTier={profile.supporterTier ?? null}
							/>
						</h2>
						<span className="ps-meta">
							{profile.points.toLocaleString()} influence &middot; {profile.nexusCount} nexus
							{profile.nexusCount !== 1 ? 'es' : ''} &middot; {profile.accountAgeDays}d played
						</span>
					</div>

					{fs.status !== 'self' && (
						<div className="pp-friend-actions">
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
								<button
									className="ps-tab"
									onClick={handleFriendAction}
									disabled={friendBusy}
									title="Remove friend"
								>
									<UserCheck size={14} aria-hidden="true" />
									<span>Friends</span>
								</button>
							)}
						</div>
					)}
				</div>

				{(profile.isAlphaFounder || profile.supporterTier === 'commander') && (
					<Section title="Badges">
						<ProfileBadges
							isAlphaFounder={profile.isAlphaFounder}
							supporterTier={profile.supporterTier ?? null}
						/>
					</Section>
				)}

				{profile.streak && profile.streak.currentStreak > 0 && (
					<div className="ps-streak-card">
						{profile.streak.currentStreak > 3 && <div className="ps-streak-fire-bg" />}
						<div className="ps-streak-content">
							<div className="ps-streak-info">
								<span className="ps-streak-label">Current Streak</span>
								<span className="ps-streak-value">
									{profile.streak.currentStreak} day{profile.streak.currentStreak !== 1 ? 's' : ''}
								</span>
							</div>
							<div className="ps-streak-bonus">
								<span className="ps-streak-best-label">Bonus</span>
								<span className="ps-streak-best-value">
									x{getStreakMultiplier(profile.streak.currentStreak).toFixed(1)}
								</span>
							</div>
							{profile.streak.longestStreak > profile.streak.currentStreak && (
								<div className="ps-streak-best">
									<span className="ps-streak-best-label">Best</span>
									<span className="ps-streak-best-value">{profile.streak.longestStreak}</span>
								</div>
							)}
						</div>
					</div>
				)}

				<Section title="Combat">
					<div className="ps-cards">
						<StatCard
							label="Victories"
							value={profile.combat.victories}
							sub={`Win rate ${winRate}%`}
						/>
						<StatCard label="Defeats" value={profile.combat.defeats} />
						<StatCard label="Attacks Launched" value={profile.combat.attacksLaunched} />
						<StatCard label="Attacks Defended" value={profile.combat.attacksDefended} />
						<StatCard
							label="Troops Killed"
							value={fmt(profile.combat.troopsKilled)}
							sub={`K/D ${kd}`}
						/>
						<StatCard label="Troops Lost" value={fmt(profile.combat.troopsLost)} />
						<StatCard
							label="Resources Stolen"
							value={fmt(totalStolen)}
							sub={`B ${fmt(profile.combat.resourcesStolen.biomass)} / A ${fmt(profile.combat.resourcesStolen.alloy)} / O ${fmt(profile.combat.resourcesStolen.ore)}`}
						/>
						<StatCard
							label="Resources Lost"
							value={fmt(totalLost)}
							sub={`B ${fmt(profile.combat.resourcesLost.biomass)} / A ${fmt(profile.combat.resourcesLost.alloy)} / O ${fmt(profile.combat.resourcesLost.ore)}`}
						/>
					</div>
				</Section>

				<Section title="Empire">
					<div className="ps-cards">
						<StatCard label="Total Nexuses" value={profile.nexusCount} />
						{profile.totalTroops != null && (
							<StatCard label="Total Troops" value={fmt(profile.totalTroops)} />
						)}
						<StatCard label="Influence" value={profile.points.toLocaleString()} />
						<StatCard label="Account Age" value={`${profile.accountAgeDays}d`} />
						<StatCard
							label="Total Influence"
							value={profile.totalInfluence.toLocaleString()}
							sub="All galaxies"
						/>
						<StatCard label="Best Galaxy" value={fmt(profile.bestSingleGalaxy)} />
						<StatCard
							label="Galaxies Won"
							value={profile.galaxiesWon}
							sub={`out of ${profile.galaxiesPlayed}`}
						/>
					</div>
				</Section>

				{profile.nexuses.length > 0 && (
					<Section title={`${profile.username}'s Nexuses`}>
						<div className="ps-nexus-list">
							{profile.nexuses.map((n) => (
								<div key={n.id ?? n._id} className="ps-nexus-row">
									<div className="ps-nexus-info">
										<span className="ps-nexus-name">{n.name}</span>
										<span className="ps-nexus-meta">
											{n.nexusType && <span className="ps-nexus-type">{n.nexusType}</span>}
											{n.points != null && <span>{n.points} pts</span>}
										</span>
									</div>
									<button
										className="ps-nexus-coords"
										onClick={() => router.push(`/starfield?cx=${n.x}&cy=${n.y}`)}
										title="Open on Starfield map"
									>
										<MapPin size={12} aria-hidden="true" />
										{n.x}|{n.y}
									</button>
								</div>
							))}
						</div>
					</Section>
				)}

				<Section title="Galaxies">
					{profile.galaxies.length === 0 ? (
						<div className="ps-card-sub">No galaxies played yet.</div>
					) : (
						<div className="pp-galaxy-list">
							{profile.galaxies.map((g) => {
								const ended = g.status === 'ended';
								const lost = ended && !g.isWinner;
								return (
									<div key={g.galaxyId} className="ps-card pp-galaxy-row">
										<div className="pp-galaxy-main">
											<div className="pp-galaxy-title">
												<strong>{g.galaxyName}</strong>
												{g.isCurrent && <span className="ps-card-sub">&middot; current</span>}
												{ended && g.isWinner && (
													<span className="ps-card-sub pp-winner">
														<Crown size={12} aria-hidden="true" /> winner
													</span>
												)}
												{ended && !g.isWinner && (
													<span className="ps-card-sub">&middot; ended</span>
												)}
											</div>
											<div className="ps-card-sub">
												{g.faction ? `${g.faction.name} [${g.faction.tag}]` : 'No faction'}
												{g.faction && g.faction.role !== 'member' ? ` / ${g.faction.role}` : ''}
											</div>
										</div>
										<div className="pp-galaxy-points">
											<div className="ps-card-value">
												{lost ? '0' : g.effectivePoints.toLocaleString()}
											</div>
											<div className="ps-card-sub">
												{lost
													? 'lost / counts as 0'
													: ended
														? 'final influence'
														: 'current influence'}
											</div>
										</div>
									</div>
								);
							})}
						</div>
					)}
				</Section>
			</div>
		</GameLayout>
	);
}

export default function PublicProfilePage() {
	return (
		<Suspense
			fallback={
				<GameLayout activePage="profile">
					<PageSkeleton variant="rows" count={5} />
				</GameLayout>
			}
		>
			<PublicProfilePageInner />
		</Suspense>
	);
}
