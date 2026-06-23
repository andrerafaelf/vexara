'use client';

import Avatar from '@/components/Avatar';
import ConnectionStatusBar from '@/components/ConnectionStatusBar';
import CampaignComplete from '@/components/CampaignComplete';
import ConqueredModal from '@/components/ConqueredModal';
import DiscordButton from '@/components/DiscordButton';
import CurrentObjective from '@/components/CurrentObjective';
import DailyStreaks from '@/components/DailyStreaks';
import DominanceBar from '@/components/DominanceBar';
import { RailMovements } from '@/components/RailMovements';
import RailBattlePass from '@/components/RailBattlePass';
import { HeaderResourceStrip } from '@/components/HeaderResourceStrip';
import MobileNexusDrawer from '@/components/MobileNexusDrawer';
import NewPatchToast from '@/components/NewPatchToast';
import NexusSidebar from '@/components/NexusSidebar';
import OnboardingOverlay from '@/components/OnboardingOverlay';
import SupportTiersCard from '@/components/SupportTiersCard';
import TroopMovementsBar from '@/components/TroopMovementsBar';
import { useAuth } from '@/context/AuthContext';
import { ModalQueueProvider } from '@/context/ModalQueueContext';
import { OnboardingProvider } from '@/context/OnboardingContext';
import { useUserStats } from '@/features/social/useSocial';
import { useFriendsUnread } from '@/hooks/useFriendsUnread';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useNotificationBadges } from '@/hooks/useNotificationBadges';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import '@/styles/ConnectionStatusBar.css';
import '@/styles/Game.css';
import '@/styles/InGameIdentity.css';
import { Nexus } from '@/types/game';
import { ChevronDown, Menu, Home, Globe, FileText, MoreHorizontal, Swords } from 'lucide-react';
import { NexusIcon } from '@/components/VexaraIcons';
import { objectIcon } from '@/data/gameIcons';
import { usePathname, useRouter } from 'next/navigation';
import { startTransition, useCallback, useEffect, useMemo, useState } from 'react';
import { useStartProgress } from './NavigationProgress';

type ActivePage =
	| 'dashboard'
	| 'starfield'
	| 'market'
	| 'combat-logs'
	| 'allies'
	| 'factions'
	| 'players'
	| 'profile'
	| 'shop'
	| 'hall-of-fame';

const PAGE_TITLES: Record<ActivePage, string> = {
	dashboard: 'My Nexus',
	starfield: 'Galaxy',
	market: 'Market',
	'combat-logs': 'Reports',
	allies: 'Allies',
	factions: 'Factions',
	players: 'Players',
	profile: 'Profile',
	shop: 'Quartermaster',
	'hall-of-fame': 'Hall of Champions'
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
	const [nexusIconArtFailed, setNexusIconArtFailed] = useState(false);
	// `user` comes from AuthContext, which reads localStorage — so it's null
	// during SSR + the first client render but populated immediately after. Any
	// auth-dependent chrome (the commander cards) must therefore wait until after
	// mount, or the server HTML (no card) won't match the first client render
	// (card present) and React throws a hydration mismatch. mounted is false on
	// both server and first client render, then flips true on the next tick.
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);
	const authUser = mounted ? user : null;

	// The Starfield/Map page is full-bleed (its own --map padding) and a right
	// rail would crowd it, so the Daily Quests rail is suppressed there.
	const isMapPage =
		activePage === 'starfield' || (mainClassName ?? '').includes('main-content--map');

	const resolvedSelectedId =
		externalSelectedId ?? (hookSelectedNexus ? String(hookSelectedNexus._id) : null);

	// The nexus whose economy feeds the persistent header resource strip. Prefer
	// the externally-driven selection (the nexus page passes selectedNexusId), and
	// fall back to the hook's selection so other pages (Starfield, Market…) still
	// show the player's current nexus economy. Looked up from the loaded list so a
	// bare id from localStorage resolves to a full Nexus.
	const headerNexus =
		(resolvedSelectedId ? nexuses.find((n) => String(n._id) === resolvedSelectedId) : null) ??
		hookSelectedNexus ??
		null;

	// Soft-gate secondary nav (Market / Allies / Factions / Players) for fresh
	// players so the top bar doesn't look like an airline cockpit on day one.
	// Each tab promotes itself once the player has organically hit the bar for
	// using it (e.g. a production building built -> Factions matters). Promotion is
	// sticky via localStorage so veterans never see the collapsed state.
	//
	// The whole nav still renders if the route is hit directly - this is purely
	// visual hierarchy, not a route gate. Bookmarks keep working.
	const maxCommandCore = nexuses.reduce(
		(max, n) => Math.max(max, n.buildings?.commandCore ?? 0),
		0
	);
	// "Has any class building" - the post-Recruitment-Core successor signal.
	// Used to know when the player has built at least one production building.
	const anyProductionBuilding = nexuses.some(
		(n) =>
			(n.buildings?.hangarBay ?? 0) >= 1 ||
			(n.buildings?.plasmaForge ?? 0) >= 1 ||
			(n.buildings?.armorFoundry ?? 0) >= 1
	);
	// We don't have a "has ever sent an attack" or "has any combat logs"
	// signal here without an extra query, so promote Players once the player
	// has any unread combat log OR has reached CC≥3 (which by then they've
	// almost certainly engaged the map). hasUnreadReports is true at least once
	// for everyone who has received any attack/scout reply.
	const liveUnlocks = useMemo(
		() => ({
			market: maxCommandCore >= 3,
			allies: maxCommandCore >= 2,
			factions: anyProductionBuilding,
			players: maxCommandCore >= 3 || hasUnreadReports
		}),
		[maxCommandCore, anyProductionBuilding, hasUnreadReports]
	);

	// Sticky promotion for social tabs. Market deliberately follows the live
	// Command Core level so it remains under More until level 3.
	const promoteStorageKey = user?.username ? `vx_nav_promoted_${user.username}` : null;
	const [promoted, setPromoted] = useState<Record<'allies' | 'factions' | 'players', boolean>>({
		allies: false,
		factions: false,
		players: false
	});
	useEffect(() => {
		if (!promoteStorageKey) return;
		try {
			const raw = localStorage.getItem(promoteStorageKey);
			if (raw) {
				const parsed = JSON.parse(raw);
				setPromoted({
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
			allies: promoted.allies || liveUnlocks.allies,
			factions: promoted.factions || liveUnlocks.factions,
			players: promoted.players || liveUnlocks.players
		};
		if (
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

	// Keep locked destinations under More even while visiting them. More carries
	// the active state until the destination is organically promoted.
	const showMarket = liveUnlocks.market;
	const showAllies = promoted.allies || liveUnlocks.allies;
	const showFactions = promoted.factions || liveUnlocks.factions;
	const showPlayers = promoted.players || liveUnlocks.players;
	const hiddenCount =
		(showMarket ? 0 : 1) + (showAllies ? 0 : 1) + (showFactions ? 0 : 1) + (showPlayers ? 0 : 1);
	const isDiscoverActive =
		isDiscoverOpen ||
		(!showMarket && activePage === 'market') ||
		(!showAllies && activePage === 'allies') ||
		(!showFactions && activePage === 'factions') ||
		(!showPlayers && activePage === 'players');

	// Prefetch all sibling routes on mount so cross-page navigation is instant. Next caches
	// these aggressively (RSC payloads + JS chunks). Doing it once per layout mount is cheap.
	const prefetchTargets = useMemo(
		() =>
			[
				resolvedSelectedId ? `/nexus/${resolvedSelectedId}` : null,
				'/starfield',
				'/market',
				'/reports',
				'/allies',
				'/factions',
				'/players',
				'/profile',
				'/shop'
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
						{/* ── Mobile row 1: hamburger + logo + nexus toggle ── */}
						<div className="header-mobile-row">
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
										alt="Vexara"
										className="vx-wordmark-stamp"
									/>
								</h1>
							</div>

							<div className="header-center">
								<button
									className={`nav-btn${is('dashboard') ? ' active' : ''}`}
									onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}
									onMouseEnter={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}
									onFocus={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}
								>
									My Nexus
								</button>
								<button
									className={`nav-btn${is('starfield') ? ' active' : ''}`}
									onClick={nav('/starfield')}
									onMouseEnter={prefetchOnHover('/starfield')}
									onFocus={prefetchOnHover('/starfield')}
									data-onboarding="open-starfield"
								>
									Galaxy
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
									onClick={nav('/reports')}
									onMouseEnter={prefetchOnHover('/reports')}
									onFocus={prefetchOnHover('/reports')}
								>
									<span className="nav-btn-content">
										Reports
										{hasUnreadReports && (
											<span className="nav-attention-mark" aria-label="Unread reports" />
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
								{hiddenCount > 0 && (
									<div className="nav-discover-wrap">
										<button
											type="button"
											className={`nav-btn nav-discover-btn${isDiscoverActive ? ' active' : ''}`}
											onClick={() => setIsDiscoverOpen((v) => !v)}
											aria-haspopup="menu"
											aria-expanded={isDiscoverOpen}
											title="More features, unlock as you progress"
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
														<span className="nav-discover-req">Build a production building</span>
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
														<span className="nav-discover-req">First combat log</span>
													</button>
												)}
											</div>
										)}
									</div>
								)}
							</div>

							{/* ── Mobile: compact resources inline in single-row header ──
						    On desktop this is display:none; the full strip is in .resource-subheader below the header. */}
							{headerNexus && (
								<div className="header-resources-inline">
									<HeaderResourceStrip nexus={headerNexus} compact />
								</div>
							)}

							<div className="header-right">
								<div className="header-utility">
									<a
										href="/codex"
										target="_blank"
										rel="noopener noreferrer"
										className="header-utility-link"
										title="Codex — game reference"
									>
										Codex
									</a>
									<a
										href="/calculator"
										target="_blank"
										rel="noopener noreferrer"
										className="header-utility-link"
										title="Battle calculator"
									>
										Calculator
									</a>
								</div>
								<DiscordButton variant="pill" label="Discord" utm="ingame_header" />
								<button
									className={`nexus-drawer-toggle${isNexusDrawerOpen ? ' active' : ''}`}
									onClick={() => setIsNexusDrawerOpen((v) => !v)}
									aria-label="Toggle nexus panel"
									aria-expanded={isNexusDrawerOpen}
									title="Your Nexuses"
								>
									{nexusIconArtFailed ? (
										<NexusIcon size={20} />
									) : (
										<img
											src={objectIcon('nexus')}
											alt=""
											width={20}
											height={20}
											draggable={false}
											onError={() => setNexusIconArtFailed(true)}
											style={{ display: 'block', objectFit: 'contain' }}
										/>
									)}
								</button>
							</div>
						</div>
						{/* end header-mobile-row */}
					</header>

					<ConnectionStatusBar />
					<TroopMovementsBar />
					<DominanceBar />
					<ConqueredModal />
					<CampaignComplete />
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
						{authUser && (
							<div className="commander-card commander-card-mobile">
								<Avatar
									username={authUser.username}
									avatarUrl={authUser.avatarUrl ?? null}
									avatarUrlSm={authUser.avatarUrlSm ?? null}
									size="md"
									borderKey={authUser.avatarBorder ?? null}
									className="commander-avatar"
									wrapperClassName="commander-avatar"
									supporterTier={authUser.supporterTier ?? null}
									ariaHidden
								/>
								<div className="commander-info">
									<div className="commander-name-row">
										<span
											className={[
												'commander-name',
												authUser.isSupporter ? 'supporter-name' : null,
												authUser.supporterTier === 'recruit' ? 'supporter-tier-recruit' : null,
												authUser.supporterTier === 'officer' ? 'supporter-tier-officer' : null,
												authUser.supporterTier === 'vanguard' ? 'supporter-tier-vanguard' : null,
												authUser.supporterTier === 'commander' ? 'supporter-tier-commander' : null
											]
												.filter(Boolean)
												.join(' ')}
										>
											{authUser.username}
										</span>
										{/* No rank badges here: this card is width-constrained and a badge
										    would truncate the username (see profile page for badges). */}
									</div>
									<div className="commander-meta">
										{nexuses.reduce((s, n) => s + (n.points ?? 0), 0).toLocaleString()} inf
									</div>
								</div>
							</div>
						)}
						<div className="mobile-drawer-pass">
							<RailBattlePass />
						</div>
						<div className="mobile-drawer-links">
							<button
								className={`nav-btn${is('dashboard') ? ' active' : ''}`}
								onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}
							>
								My Nexus
							</button>
							<button
								className={`nav-btn${is('starfield') ? ' active' : ''}`}
								onClick={nav('/starfield')}
								data-onboarding="open-starfield"
							>
								Galaxy
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
								onClick={nav('/reports')}
							>
								<span className="nav-btn-content">
									Reports
									{hasUnreadReports && (
										<span className="nav-attention-mark" aria-label="Unread reports" />
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
							<DiscordButton
								variant="solid"
								label="Join the Discord"
								className="mobile-drawer-discord"
								utm="ingame_drawer"
							/>
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
											<span className="nav-discover-req">Build a production building</span>
										</button>
									)}
									{!showPlayers && (
										<button
											type="button"
											className="nav-btn nav-discover-item-mobile"
											onClick={nav('/players')}
										>
											<span>Players</span>
											<span className="nav-discover-req">First combat log</span>
										</button>
									)}
								</div>
							)}
							<SupportTiersCard
								variant="compact"
								currentTier={authUser?.supporterTier ?? null}
								isFounder={authUser?.isFounder}
								isSupporter={authUser?.isSupporter}
							/>
						</div>
					</aside>

					<div className="game-content">
						<NexusSidebar
							nexuses={nexuses}
							selectedNexusId={resolvedSelectedId}
							onSelectNexus={handleSelectNexus}
							unreadNexusIds={unreadNexusIds}
							user={authUser}
						/>
						<main className={`main-content${mainClassName ? ` ${mainClassName}` : ''}`}>
							{headerNexus && (
								<div className="resource-subheader">
									<HeaderResourceStrip nexus={headerNexus} />
								</div>
							)}
							{children}
						</main>
						{/* Right rail: Daily Quests live here so the left rail is free for the
						    nexus list (which grows as the player takes more nexuses). Hidden
						    on the full-bleed map page, where a side rail would crowd the
						    starfield. Collapses below the content breakpoint (see CSS). */}
						{!isMapPage && (
							<aside className="game-rail-right" aria-label="Activity">
								<div className="game-rail-right-scroll">
									<CurrentObjective />
									<RailMovements />
									<RailBattlePass />
									<DailyStreaks variant="rail" />
								</div>
								<div className="game-rail-right-footer">
									<SupportTiersCard
										variant="compact"
										currentTier={authUser?.supporterTier ?? null}
										isFounder={authUser?.isFounder}
										isSupporter={authUser?.isSupporter}
									/>
								</div>
							</aside>
						)}
					</div>
					<OnboardingOverlay />

					{/* ── Mobile bottom navigation bar ── */}
					<nav className="mobile-bottom-nav" aria-label="Main navigation">
						<button
							className={`mobile-bottom-nav-btn${is('dashboard') ? ' active' : ''}`}
							onClick={nav(`/nexus/${resolvedSelectedId ?? ''}`)}
							onMouseEnter={prefetchOnHover(`/nexus/${resolvedSelectedId ?? ''}`)}
							aria-label="My Nexus"
						>
							<span className="mobile-bottom-nav-icon">
								<Home size={20} />
							</span>
							<span className="mobile-bottom-nav-label">Nexus</span>
						</button>
						<button
							className={`mobile-bottom-nav-btn${is('starfield') ? ' active' : ''}`}
							onClick={nav('/starfield')}
							onMouseEnter={prefetchOnHover('/starfield')}
							data-onboarding="open-starfield"
							aria-label="Galaxy map"
						>
							<span className="mobile-bottom-nav-icon">
								<Globe size={20} />
							</span>
							<span className="mobile-bottom-nav-label">Galaxy</span>
						</button>
						<button
							className={`mobile-bottom-nav-btn${is('combat-logs') ? ' active' : ''}`}
							onClick={nav('/reports')}
							onMouseEnter={prefetchOnHover('/reports')}
							aria-label="Combat reports"
						>
							<span className="mobile-bottom-nav-icon">
								<FileText size={20} />
								{hasUnreadReports && (
									<span className="mobile-bottom-nav-dot" aria-label="Unread reports" />
								)}
							</span>
							<span className="mobile-bottom-nav-label">Reports</span>
						</button>
						{(showFactions || showAllies) && (
							<button
								className={`mobile-bottom-nav-btn${is('factions') || is('allies') ? ' active' : ''}`}
								onClick={nav(showFactions ? '/factions' : '/allies')}
								onMouseEnter={prefetchOnHover(showFactions ? '/factions' : '/allies')}
								data-onboarding="open-factions"
								aria-label={showFactions ? 'Factions' : 'Allies'}
							>
								<span className="mobile-bottom-nav-icon">
									<Swords size={20} />
									{(hasFactionAttention || hasUnreadFriends || hasTokens) && (
										<span
											className="mobile-bottom-nav-dot mobile-bottom-nav-dot--accent"
											aria-label="Action required"
										/>
									)}
								</span>
								<span className="mobile-bottom-nav-label">
									{showFactions ? 'Factions' : 'Allies'}
								</span>
							</button>
						)}
						<button
							className={`mobile-bottom-nav-btn${isMobileMenuOpen ? ' active' : ''}`}
							onClick={() => setIsMobileMenuOpen((p) => !p)}
							aria-label="More options"
							aria-expanded={isMobileMenuOpen}
						>
							<span className="mobile-bottom-nav-icon">
								<MoreHorizontal size={20} />
							</span>
							<span className="mobile-bottom-nav-label">More</span>
						</button>
					</nav>
				</div>
			</OnboardingProvider>
		</ModalQueueProvider>
	);
}
