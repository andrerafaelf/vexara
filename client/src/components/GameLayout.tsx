'use client';

import ConnectionStatusBar from '@/components/ConnectionStatusBar';
import ConqueredModal from '@/components/ConqueredModal';
import DominanceBar from '@/components/DominanceBar';
import NewPatchToast from '@/components/NewPatchToast';
import OnboardingOverlay from '@/components/OnboardingOverlay';
import TroopMovementsBar from '@/components/TroopMovementsBar';
import { ModalQueueProvider } from '@/context/ModalQueueContext';
import { OnboardingProvider } from '@/context/OnboardingContext';
import '@/styles/ConnectionStatusBar.css';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NexusSidebar from '@/components/NexusSidebar';
import { useAuth } from '@/context/AuthContext';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useNotificationBadges } from '@/hooks/useNotificationBadges';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import '@/styles/Game.css';
import '@/styles/InGameIdentity.css';
import { Nexus } from '@/types/game';
import { Building2, ChevronDown, Menu } from 'lucide-react';
import SupportTiersCard from '@/components/SupportTiersCard';
import Avatar from '@/components/Avatar';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useStartProgress } from './NavigationProgress';
import { useUserStats } from '@/features/social/useSocial';

type ActivePage =
	| 'dashboard'
	| 'starfield'
	| 'market'
	| 'combat-logs'
	| 'allies'
	| 'factions'
	| 'players'
	| 'profile';

const PAGE_TITLES: Record<ActivePage, string> = {
	dashboard: 'Dashboard',
	starfield: 'Starfield',
	market: 'Market',
	'combat-logs': 'Combat Logs',
	allies: 'Allies',
	factions: 'Factions',
	players: 'Players',
	profile: 'Profile'
};

interface GameLayoutProps {
	children: React.ReactNode;
	activePage?: ActivePage;
	/** Extra class(es) added to the <main> element */
	mainClassName?: string;
	/** Override which nexus is "selected" (nexus page drives this externally) */
	selectedNexusId?: string | null;
	onSelectNexus?: (nexus: Nexus) => void;
	/** Expose refetch to child page */
	onNexusesReady?: (nexuses: Nexus[], selectedNexus: Nexus | null, refetch: () => void) => void;
}

export default function GameLayout({
	children,
	activePage,
	mainClassName,
	selectedNexusId: externalSelectedId,
	onSelectNexus,
	onNexusesReady
}: GameLayoutProps) {
	const { nexuses, selectedNexus: hookSelectedNexus, refetch } = useMyNexuses();
	const { hasUnreadReports, unreadNexusIds: _unreadNexusIds } = useUnreadReports();
	const unreadNexusIds = _unreadNexusIds as Set<string>;
	const { user } = useAuth();
	useUserStats();
	const router = useRouter();
	const pathname = usePathname();
	const startProgress = useStartProgress();
	const hasUnreadFriends = useFriendsUnread();
	const { hasTokens, hasFactionAttention } = useNotificationBadges();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const [isNexusDrawerOpen, setIsNexusDrawerOpen] = useState(false);
	const [isDiscoverOpen, setIsDiscoverOpen] = useState(false);

	const resolvedSelectedId =
		externalSelectedId ?? (hookSelectedNexus ? String(hookSelectedNexus._id) : null);

	// Soft-gate secondary nav (Market / Allies / Factions / Players) for fresh
	// players so the top bar doesn't look like an airline cockpit on day one.
	// Each tab promotes itself once the player has organically hit the bar for
	// using it (e.g. Recruitment Core built → Factions matters). Promotion is
	// sticky via localStorage so veterans never see the collapsed state.
	//
	// The whole nav still renders if the route is hit directly — this is purely
	// visual hierarchy, not a route gate. Bookmarks keep working.
	const maxCommandCore = nexuses.reduce(
		(max, n) => Math.max(max, n.buildings?.commandCore ?? 0),
		0
	);
	const anyRecruitmentCore = nexuses.some((n) => (n.buildings?.recruitmentCore ?? 0) >= 1);
	const anyResourceStockpile = nexuses.some((n) => {
		const r = n.resources;
		if (!r) return false;
		return r.biomass >= 5000 || r.alloy >= 5000 || r.ore >= 5000;
	});

	// We don't have a "has ever sent an attack" or "has any combat reports"
	// signal here without an extra query, so promote Players once the player
	// has any unread combat report OR has reached CC≥3 (which by then they've
	// almost certainly engaged the map). hasUnreadReports is true at least once
	// for everyone who has received any attack/scout reply.
	const liveUnlocks = useMemo(
		() => ({
			market: maxCommandCore >= 3 || anyResourceStockpile,
			allies: maxCommandCore >= 2,
			factions: anyRecruitmentCore,
			players: maxCommandCore >= 3 || hasUnreadReports
		}),
		[maxCommandCore, anyResourceStockpile, anyRecruitmentCore, hasUnreadReports]
	);

	// Sticky promotion: once any of these tabs has been unlocked, remember it so
	// the player never sees it disappear back into "Discover" even if state
	// momentarily regresses (e.g. a respawn). Keyed per user so account-switching
	// doesn't leak unlocks.
	const promoteStorageKey = user?.username ? `vx_nav_promoted_${user.username}` : null;
	const [promoted, setPromoted] = useState<
		Record<'market' | 'allies' | 'factions' | 'players', boolean>
	>({ market: false, allies: false, factions: false, players: false });
	useEffect(() => {
		if (!promoteStorageKey) return;
		try {
			const raw = localStorage.getItem(promoteStorageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				setPromoted({
					market: !!parsed.market,
					allies: !!parsed.allies,
					factions: !!parsed.factions,
					players: !!parsed.players
				});
			}
		} catch {
			/* ignore corrupt entries */
		}
	}, [promoteStorageKey]);
	useEffect(() => {
		if (!promoteStorageKey) return;
		const merged = {
			market: promoted.market || liveUnlocks.market,
			allies: promoted.allies || liveUnlocks.allies,
			factions: promoted.factions || liveUnlocks.factions,
			players: promoted.players || liveUnlocks.players
		};
		if (
			merged.market !== promoted.market ||
			merged.allies !== promoted.allies ||
			merged.factions !== promoted.factions ||
			merged.players !== promoted.players
		) {
			setPromoted(merged);
			try {
				localStorage.setItem(promoteStorageKey, JSON.stringify(merged));
			} catch {
				/* quota */
			}
		}
	}, [liveUnlocks, promoted, promoteStorageKey]);

	// Also promote a tab if the player is currently on it — otherwise navigating
	// to a hidden route by URL would leave the corresponding nav button missing
	// from the bar, which is disorienting.
	const showMarket = promoted.market || liveUnlocks.market || activePage === 'market';
	const showAllies = promoted.allies || liveUnlocks.allies || activePage === 'allies';
	const showFactions = promoted.factions || liveUnlocks.factions || activePage === 'factions';
	const showPlayers = promoted.players || liveUnlocks.players || activePage === 'players';
	const hiddenCount =
		(showMarket ? 0 : 1) + (showAllies ? 0 : 1) + (showFactions ? 0 : 1) + (showPlayers ? 0 : 1);

	// Prefetch all sibling routes on mount so cross-page navigation is instant. Next caches
	// these aggressively (RSC payloads + JS chunks). Doing it once per layout mount is cheap.
	const prefetchTargets = useMemo(
		() =>
			[
				resolvedSelectedId ? `/nexus/${resolvedSelectedId}` : null,
				'/starfield',
				'/market',
				'/combat-logs',
				'/allies',
				'/factions',
				'/players',
				'/profile'
			].filter(Boolean) as string[],
		[resolvedSelectedId]
	);

	useEffect(() => {
		for (const href of prefetchTargets) {
			try {
				router.prefetch(href);
			} catch {
				/* prefetch is best-effort */
			}
		}
	}, [prefetchTargets, router]);

	useEffect(() => {
		setIsMobileMenuOpen(false);
		setIsNexusDrawerOpen(false);
		setIsDiscoverOpen(false);
	}, [pathname]);

	useEffect(() => {
		if (onNexusesReady) {
			onNexusesReady(nexuses, hookSelectedNexus, refetch);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nexuses.length, hookSelectedNexus?._id]);

	const handleSelectNexus = useCallback(
		(nexus: Nexus) => {
			localStorage.setItem('selectedNexusId', String(nexus._id));
			setIsMobileMenuOpen(false);
			if (onSelectNexus) {
				onSelectNexus(nexus);
			} else {
				startProgress();
				startTransition(() => router.push(`/nexus/${nexus._id}`));
			}
		},
		[onSelectNexus, router, startProgress]
	);

	const nav = useCallback(
		(href: string) => () => {
			setIsMobileMenuOpen(false);
			if (href === pathname) return;
			startProgress();
			startTransition(() => router.push(href));
		},
		[pathname, router, startProgress]
	);

	// Hover/focus prefetch on individual nav buttons, top-up over the mount-time prefetch
	// for cases where chunks may have been evicted, and a cheap signal that a click is coming.
	const prefetchOnHover = useCallback(
		(href: string) => () => {
			try {
				router.prefetch(href);
			} catch {
				/* best-effort */
			}
		},
		[router]
	);

	const closeNexusDrawer = useCallback(() => setIsNexusDrawerOpen(false), []);

	const is = (page: ActivePage) => activePage === page;

	useEffect(() => {
		const name = activePage ? PAGE_TITLES[activePage] : null;
		document.title = name ? `Vexara - ${name}` : 'Vexara';
	}, [activePage]);

	return (
		<ModalQueueProvider>
			<OnboardingProvider>
				<div className="game-container">
					<header className="game-header">
						<div className="header-left">
							<button
								className="menu-toggle"
								onClick={() => setIsMobileMenuOpen((p) => !p)}
								aria-label="Toggle navigation menu"
								aria-expanded={isMobileMenuOpen}
							>
								<Menu size={18} />
							</button>
							<h1 className="vx-wordmark game-wordmark">
								<img
									src="/vexara-logo.png"
									alt=""
									aria-hidden="true"
									className="vx-wordmark-stamp"
								/>
								<span className="vx-wordmark-name">Vexara</span>
							</h1>
						</div>

						<div className="header-center">
							<button
								className={`nav-btn${is('dashboard') ? ' active' : ''}`}
								onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}
								onMouseEnter={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}
								onFocus={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}
							>
								Dashboard
							</button>
							<button
								className={`nav-btn${is('starfield') ? ' active' : ''}`}
								onClick={nav('/starfield')}
								onMouseEnter={prefetchOnHover('/starfield')}
								onFocus={prefetchOnHover('/starfield')}
								data-onboarding="open-starfield"
							>
								Starfield
							</button>
							{showMarket && (
								<button
									className={`nav-btn${is('market') ? ' active' : ''}`}
									onClick={nav('/market')}
									onMouseEnter={prefetchOnHover('/market')}
									onFocus={prefetchOnHover('/market')}
								>
									Market
								</button>
							)}
							<button
								className={`nav-btn${is('combat-logs') ? ' active' : ''}`}
								onClick={nav('/combat-logs')}
								onMouseEnter={prefetchOnHover('/combat-logs')}
								onFocus={prefetchOnHover('/combat-logs')}
							>
								<span className="nav-btn-content">
									Combat Logs
									{hasUnreadReports && (
										<span className="nav-attention-mark" aria-label="Unread combat reports" />
									)}
								</span>
							</button>
							{showAllies && (
								<button
									className={`nav-btn${is('allies') ? ' active' : ''}`}
									onClick={nav('/allies')}
									onMouseEnter={prefetchOnHover('/allies')}
									onFocus={prefetchOnHover('/allies')}
								>
									<span className="nav-btn-content">
										Allies
										{(hasUnreadFriends || hasTokens) && (
											<span
												className="nav-attention-mark"
												aria-label="Unread ally activity or tokens to redeem"
											/>
										)}
									</span>
								</button>
							)}
							{showFactions && (
								<button
									className={`nav-btn${is('factions') ? ' active' : ''}`}
									onClick={nav('/factions')}
									onMouseEnter={prefetchOnHover('/factions')}
									onFocus={prefetchOnHover('/factions')}
									data-onboarding="open-factions"
								>
									<span className="nav-btn-content">
										Factions
										{hasFactionAttention && (
											<span className="nav-attention-mark" aria-label="Faction action required" />
										)}
									</span>
								</button>
							)}
							{showPlayers && (
								<button
									className={`nav-btn${is('players') ? ' active' : ''}`}
									onClick={nav('/players')}
									onMouseEnter={prefetchOnHover('/players')}
									onFocus={prefetchOnHover('/players')}
								>
									Players
								</button>
							)}
							<button
								className={`nav-btn${is('profile') ? ' active' : ''}`}
								onClick={nav('/profile')}
								onMouseEnter={prefetchOnHover('/profile')}
								onFocus={prefetchOnHover('/profile')}
							>
								Profile
							</button>
							<a href="/codex" target="_blank" rel="noopener noreferrer" className="nav-btn">
								Codex
							</a>
							<a href="/calculator" target="_blank" rel="noopener noreferrer" className="nav-btn">
								Calculator
							</a>
							{hiddenCount > 0 && (
								<div className="nav-discover-wrap">
									<button
										type="button"
										className={`nav-btn nav-discover-btn${isDiscoverOpen ? ' active' : ''}`}
										onClick={() => setIsDiscoverOpen((v) => !v)}
										aria-haspopup="menu"
										aria-expanded={isDiscoverOpen}
										title="More features — unlock as you progress"
									>
										<span className="nav-btn-content">
											More
											<ChevronDown size={14} aria-hidden="true" />
										</span>
									</button>
									{isDiscoverOpen && (
										<div className="nav-discover-menu" role="menu">
											<p className="nav-discover-hint">Unlocks as you progress</p>
											{!showMarket && (
												<button
													type="button"
													role="menuitem"
													className="nav-discover-item"
													onClick={() => {
														setIsDiscoverOpen(false);
														nav('/market')();
													}}
												>
													<span>Market</span>
													<span className="nav-discover-req">Command Core Lv3</span>
												</button>
											)}
											{!showAllies && (
												<button
													type="button"
													role="menuitem"
													className="nav-discover-item"
													onClick={() => {
														setIsDiscoverOpen(false);
														nav('/allies')();
													}}
												>
													<span>Allies</span>
													<span className="nav-discover-req">Command Core Lv2</span>
												</button>
											)}
											{!showFactions && (
												<button
													type="button"
													role="menuitem"
													className="nav-discover-item"
													onClick={() => {
														setIsDiscoverOpen(false);
														nav('/factions')();
													}}
												>
													<span>Factions</span>
													<span className="nav-discover-req">Build Recruitment Core</span>
												</button>
											)}
											{!showPlayers && (
												<button
													type="button"
													role="menuitem"
													className="nav-discover-item"
													onClick={() => {
														setIsDiscoverOpen(false);
														nav('/players')();
													}}
												>
													<span>Players</span>
													<span className="nav-discover-req">First combat report</span>
												</button>
											)}
										</div>
									)}
								</div>
							)}
						</div>

						<div className="header-right">
							<button
								className={`nexus-drawer-toggle${isNexusDrawerOpen ? ' active' : ''}`}
								onClick={() => setIsNexusDrawerOpen((v) => !v)}
								aria-label="Toggle nexus panel"
								aria-expanded={isNexusDrawerOpen}
								title="Your Nexuses"
							>
								<Building2 size={18} />
							</button>
						</div>
					</header>

					<ConnectionStatusBar />
					<TroopMovementsBar />
					<DominanceBar />
					<ConqueredModal />
					<NewPatchToast />

					<MobileNexusDrawer
						nexuses={nexuses}
						selectedNexusId={resolvedSelectedId}
						onSelectNexus={handleSelectNexus}
						isOpen={isNexusDrawerOpen}
						onClose={closeNexusDrawer}
						unreadNexusIds={unreadNexusIds}
					/>

					<button
						type="button"
						className={`mobile-drawer-backdrop ${isMobileMenuOpen ? 'open' : ''}`}
						aria-label="Close navigation menu"
						onClick={() => setIsMobileMenuOpen(false)}
					/>

					<aside className={`mobile-drawer ${isMobileMenuOpen ? 'open' : ''}`}>
						{user && (
							<div className="commander-card commander-card-mobile">
								<Avatar
									username={user.username}
									avatarUrl={user.avatarUrl ?? null}
									avatarUrlSm={user.avatarUrlSm ?? null}
									size="md"
									className={`commander-avatar${user.supporterTier === 'officer' ? ' supporter-border supporter-border-officer' : ''}${user.supporterTier === 'commander' ? ' supporter-border supporter-border-commander' : ''}`}
									ariaHidden
								/>
								<div className="commander-info">
									<div
										className={[
											'commander-name',
											user.isSupporter ? 'supporter-name' : null,
											user.supporterTier === 'recruit' ? 'supporter-tier-recruit' : null,
											user.supporterTier === 'officer' ? 'supporter-tier-officer' : null,
											user.supporterTier === 'commander' ? 'supporter-tier-commander' : null
										]
											.filter(Boolean)
											.join(' ')}
									>
										{user.username}
									</div>
									<div className="commander-meta">
										Commander · {nexuses.reduce((s, n) => s + (n.points ?? 0), 0).toLocaleString()}{' '}
										inf
									</div>
								</div>
							</div>
						)}
						<div className="mobile-drawer-links">
							<button
								className={`nav-btn${is('dashboard') ? ' active' : ''}`}
								onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}
							>
								Dashboard
							</button>
							<button
								className={`nav-btn${is('starfield') ? ' active' : ''}`}
								onClick={nav('/starfield')}
								data-onboarding="open-starfield"
							>
								Starfield
							</button>
							{showMarket && (
								<button
									className={`nav-btn${is('market') ? ' active' : ''}`}
									onClick={nav('/market')}
								>
									Market
								</button>
							)}
							<button
								className={`nav-btn${is('combat-logs') ? ' active' : ''}`}
								onClick={nav('/combat-logs')}
							>
								<span className="nav-btn-content">
									Combat Logs
									{hasUnreadReports && (
										<span className="nav-attention-mark" aria-label="Unread combat reports" />
									)}
								</span>
							</button>
							{showAllies && (
								<button
									className={`nav-btn${is('allies') ? ' active' : ''}`}
									onClick={nav('/allies')}
								>
									<span className="nav-btn-content">
										Allies
										{(hasUnreadFriends || hasTokens) && (
											<span
												className="nav-attention-mark"
												aria-label="Unread ally activity or tokens to redeem"
											/>
										)}
									</span>
								</button>
							)}
							{showFactions && (
								<button
									className={`nav-btn${is('factions') ? ' active' : ''}`}
									onClick={nav('/factions')}
									data-onboarding="open-factions"
								>
									<span className="nav-btn-content">
										Factions
										{hasFactionAttention && (
											<span className="nav-attention-mark" aria-label="Faction action required" />
										)}
									</span>
								</button>
							)}
							{showPlayers && (
								<button
									className={`nav-btn${is('players') ? ' active' : ''}`}
									onClick={nav('/players')}
								>
									Players
								</button>
							)}
							<button
								className={`nav-btn${is('profile') ? ' active' : ''}`}
								onClick={nav('/profile')}
							>
								Profile
							</button>
							<a href="/codex" target="_blank" rel="noopener noreferrer" className="nav-btn">
								Codex
							</a>
							<a href="/calculator" target="_blank" rel="noopener noreferrer" className="nav-btn">
								Calculator
							</a>
							{hiddenCount > 0 && (
								<div className="mobile-drawer-discover">
									<p className="nav-discover-hint">Unlocks as you progress</p>
									{!showMarket && (
										<button
											type="button"
											className="nav-btn nav-discover-item-mobile"
											onClick={nav('/market')}
										>
											<span>Market</span>
											<span className="nav-discover-req">Command Core Lv3</span>
										</button>
									)}
									{!showAllies && (
										<button
											type="button"
											className="nav-btn nav-discover-item-mobile"
											onClick={nav('/allies')}
										>
											<span>Allies</span>
											<span className="nav-discover-req">Command Core Lv2</span>
										</button>
									)}
									{!showFactions && (
										<button
											type="button"
											className="nav-btn nav-discover-item-mobile"
											onClick={nav('/factions')}
										>
											<span>Factions</span>
											<span className="nav-discover-req">Build Recruitment Core</span>
										</button>
									)}
									{!showPlayers && (
										<button
											type="button"
											className="nav-btn nav-discover-item-mobile"
											onClick={nav('/players')}
										>
											<span>Players</span>
											<span className="nav-discover-req">First combat report</span>
										</button>
									)}
								</div>
							)}
							<SupportTiersCard
								variant="compact"
								currentTier={user?.supporterTier ?? null}
								isFounder={user?.isFounder}
								isSupporter={user?.isSupporter}
							/>
						</div>
					</aside>

					<div className="game-content">
						<NexusSidebar
							nexuses={nexuses}
							selectedNexusId={resolvedSelectedId}
							onSelectNexus={handleSelectNexus}
							unreadNexusIds={unreadNexusIds}
							user={user}
						/>
						<main className={`main-content${mainClassName ? ` ${mainClassName}` : ''}`}>
							{children}
						</main>
					</div>
					<OnboardingOverlay />
				</div>
			</OnboardingProvider>
		</ModalQueueProvider>
	);
}
