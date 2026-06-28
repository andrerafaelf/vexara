'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Flag } from 'lucide-react';
import BreakPactModal from './BreakPactModal';
import {
	acceptFactionInvite,
	createFaction,
	declineFactionInvite,
	disbandFaction,
	getFaction,
	getMyFaction,
	getMyFactionInvites,
	getMyGalaxy,
	inviteToFaction,
	kickFactionMember,
	leaveFaction,
	setFactionMemberRole,
	transferFactionLeader,
	updateFactionMotd,
	getFactionWars,
	declareWar,
	proposeCeasefire,
	acceptCeasefire,
	declineCeasefire,
	listFactionsInGalaxy,
	requestToJoinFaction,
	cancelFactionJoinRequest,
	getMyFactionJoinRequests,
	getFactionJoinRequests,
	approveJoinRequest,
	declineJoinRequest,
	getActiveTreaties,
	proposeTreaty,
	acceptTreaty,
	cancelTreaty,
	breakNap,
	getGalaxyDiplomacy
} from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useOnboarding } from '../context/OnboardingContext';
import { useBadgesQuery } from '../hooks/useNotificationBadges';
import FactionChat from './FactionChat';
import DiplomacyChat from './DiplomacyChat';
import Username from './Username';
import FactionActivity from './FactionActivity';
import FactionLeaderboard from './FactionLeaderboard';
import WarRoom from './WarRoom';
import { usePageReady } from './NavigationProgress';
import PageSkeleton from './PageSkeleton';
import { useTabParam } from '../hooks/useTabParam';
import { useNow } from '../hooks/useNow';
import '../styles/Factions.css';

function formatRelativeTime(dateStr: string): string {
	const ms = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(ms / 60000);
	if (mins < 1) return 'Just now';
	if (mins < 60) return `${mins}m ago`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h ago`;
	const days = Math.floor(hours / 24);
	return `${days}d ago`;
}

interface Faction {
	id: number;
	name: string;
	tag: string;
	description?: string;
	motd?: string;
	createdAt: string;
	myRole?: string;
	members?: Array<{
		id: number;
		userId: number;
		username: string;
		isSupporter?: boolean;
		supporterTier?: string | null;
		role: string;
		lastPlayedAt?: string | null;
	}>;
}

interface FactionInvite {
	id: number;
	factionId: number;
	galaxyId: number;
	factionName: string;
	factionTag: string;
	invitedByUsername: string;
	expiresAt: string;
}

interface FactionWar {
	id: number;
	status: 'pending' | 'active' | 'ceasefire_pending' | 'ended';
	declarerFactionId: number;
	targetFactionId: number;
	declarerFaction: { name: string; tag: string };
	targetFaction: { name: string; tag: string };
	declaredAt: string;
	acceptedAt: string | null;
	ceasefireProposerFactionId: number | null;
}

interface GalaxyFaction {
	id: number;
	name: string;
	tag: string;
	description?: string;
	memberCount: number;
}

interface JoinRequest {
	id: number;
	userId: number;
	username: string;
	isSupporter?: boolean;
	supporterTier?: string | null;
	message: string | null;
	createdAt: string;
}

interface MyJoinRequest {
	id: number;
	factionId: number;
	factionName: string;
	factionTag: string;
	message: string | null;
	createdAt: string;
}

type Tab =
	| 'overview'
	| 'chat'
	| 'warroom'
	| 'members'
	| 'wars'
	| 'diplomacy'
	| 'activity'
	| 'galaxy';
const FACTION_TABS: readonly Tab[] = [
	'overview',
	'chat',
	'warroom',
	'members',
	'wars',
	'diplomacy',
	'activity',
	'galaxy'
] as const;

interface FactionTreaty {
	id: number;
	type: 'nap' | 'trade' | 'vassal';
	status: 'pending' | 'active' | 'expired' | 'cancelled' | 'broken';
	proposerFactionId: number;
	targetFactionId: number;
	proposerFaction?: { id: number; name: string; tag: string };
	targetFaction?: { id: number; name: string; tag: string };
	durationDays?: number | null;
	startsAt?: string | null;
	expiresAt?: string | null;
	createdAt: string;
	// NAP break fields - populated when status === 'broken'
	brokenAt?: string | null;
	betrayalEndsAt?: string | null;
	brokenByUserId?: number | null;
}

// Isolated countdown component - calls useNow() so only THIS element re-renders at 1 Hz,
// not the whole FactionsView. Server-anchored via useNow() / serverNow().
function NapBrokenCountdown({
	betrayalEndsAt,
	isBreaker
}: {
	betrayalEndsAt: string;
	isBreaker: boolean;
}) {
	const now = useNow();
	const remainMs = new Date(betrayalEndsAt).getTime() - now;
	// Resolved: victim settles to "war is live", breaker unlocks to "strike open".
	if (!(remainMs > 0)) {
		return (
			<span
				className={`factions-nap-countdown nap-stage-expired${isBreaker ? ' factions-nap-countdown--breaker' : ''}`}
			>
				{isBreaker ? 'Strike window open' : 'War is live - attacks open'}
			</span>
		);
	}
	const totalSecs = Math.floor(remainMs / 1000);
	const mins = Math.floor(totalSecs / 60);
	const clock = `${mins}:${(totalSecs % 60).toString().padStart(2, '0')}`;
	// Breaker is always flat (they chose this). The victim's stage ramps as the
	// clock runs down, driving the copy verb and the escalating CSS.
	const stage = isBreaker
		? 'flat'
		: totalSecs > 900
			? 'rising'
			: totalSecs > 300
				? 'mid'
				: totalSecs > 60
					? 'critical'
					: 'final';
	const text = isBreaker
		? `strike window opens in ${clock}`
		: stage === 'critical' || stage === 'final'
			? `BRACE - war in ${clock}`
			: `war lands in ${clock}`;
	return (
		<span
			className={`factions-nap-countdown nap-stage-${stage}${isBreaker ? ' factions-nap-countdown--breaker' : ''}`}
		>
			{text}
		</span>
	);
}

const ROLE_ORDER: Record<string, number> = { leader: 0, officer: 1, member: 2 };

export default function FactionsView() {
	const { currentStep, advance: advanceOnboarding } = useOnboarding();
	const [myFaction, setMyFaction] = useState<(Faction & { myRole: string }) | null>(null);
	const [invites, setInvites] = useState<FactionInvite[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState('');
	const [activeTab, setActiveTab] = useTabParam<Tab>(FACTION_TABS, 'overview');
	usePageReady(!loading, 'factions');
	const isJoinFactionOnboarding = currentStep?.id === 'join_faction';

	useEffect(() => {
		if (!loading && myFaction && isJoinFactionOnboarding) {
			advanceOnboarding();
		}
	}, [advanceOnboarding, isJoinFactionOnboarding, loading, myFaction]);

	// Galaxy name for the cold-start hero headline. Reuses the cached 'myGalaxy'
	// query that GalaxyChip already keeps warm, so there is no extra network call.
	type MyGalaxyResponse = { activeGalaxy?: { name?: string | null } | null };
	const { data: galaxyData } = useQuery({
		queryKey: ['myGalaxy'] as const,
		queryFn: () => getMyGalaxy().then((r) => r.data as MyGalaxyResponse),
		staleTime: 5 * 60_000
	});
	const galaxyName: string | null = galaxyData?.activeGalaxy?.name ?? null;

	const [showCreateForm, setShowCreateForm] = useState(false);
	// true when the create form was opened from the founding-hero CTA rather
	// than the secondary "Found Your Own" button in the populated state.
	const [isFoundingCreate, setIsFoundingCreate] = useState(false);
	// true for ~600ms after a successful founding, drives the success flourish.
	const [foundingSuccess, setFoundingSuccess] = useState(false);
	const [formName, setFormName] = useState('');
	const [formTag, setFormTag] = useState('');
	const [formDesc, setFormDesc] = useState('');
	const [formError, setFormError] = useState('');
	const [formSubmitting, setFormSubmitting] = useState(false);

	const [inviteUsername, setInviteUsername] = useState('');
	const [inviteError, setInviteError] = useState('');
	const [inviteSubmitting, setInviteSubmitting] = useState(false);

	const [motdDraft, setMotdDraft] = useState('');
	const [editingMotd, setEditingMotd] = useState(false);
	const [motdSubmitting, setMotdSubmitting] = useState(false);
	const [motdError, setMotdError] = useState('');

	const [wars, setWars] = useState<FactionWar[]>([]);
	const [galaxyFactions, setGalaxyFactions] = useState<GalaxyFaction[]>([]);
	const [selectedDeclareTarget, setSelectedDeclareTarget] = useState('');
	const [warError, setWarError] = useState('');
	const [warSubmitting, setWarSubmitting] = useState(false);

	const [treaties, setTreaties] = useState<FactionTreaty[]>([]);
	const [treatyTarget, setTreatyTarget] = useState('');
	const [treatyType, setTreatyType] = useState<'nap' | 'trade' | 'vassal'>('nap');
	const [treatyDuration, setTreatyDuration] = useState(30);
	const [treatyError, setTreatyError] = useState('');
	const [treatySubmitting, setTreatySubmitting] = useState(false);
	const [galaxyTreaties, setGalaxyTreaties] = useState<FactionTreaty[]>([]);
	const [activeDiplomacyTreatyId, setActiveDiplomacyTreatyId] = useState<number | null>(null);
	// treatyId currently mid-break-request, or null when idle. Used to disable the button.
	const [breakNapSubmitting, setBreakNapSubmitting] = useState<number | null>(null);
	// The active break-pact confirm modal (treaty + partner label), or null.
	const [breakNapModal, setBreakNapModal] = useState<{ treatyId: number; targetLabel: string } | null>(
		null
	);
	// Inline error shown inside the break-pact modal (kept separate from treatyError).
	const [breakNapError, setBreakNapError] = useState<string | null>(null);

	// Join requests (for leader/officer view inside a faction)
	const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
	const [joinRequestsError, setJoinRequestsError] = useState('');

	// My pending join requests (for players without a faction)
	const [myJoinRequests, setMyJoinRequests] = useState<MyJoinRequest[]>([]);
	// All factions in galaxy (for the browser when player has no faction)
	const [allGalaxyFactions, setAllGalaxyFactions] = useState<GalaxyFaction[]>([]);
	const [joinRequestMsg, setJoinRequestMsg] = useState<Record<number, string>>({});
	const [joinRequestSubmitting, setJoinRequestSubmitting] = useState<Record<number, boolean>>({});
	const [joinRequestError, setJoinRequestError] = useState<Record<number, string>>({});
	// Per-faction "add a note" toggle in the Recruiting Now cards.
	const [showJoinNote, setShowJoinNote] = useState<Record<number, boolean>>({});

	// Click-to-expand on faction names: fetch the member list lazily and cache it.
	const [expandedFactionId, setExpandedFactionId] = useState<number | null>(null);
	const [factionMemberCache, setFactionMemberCache] = useState<
		Record<
			number,
			| Array<{
					userId: number;
					username: string;
					isSupporter: boolean;
					supporterTier?: string | null;
					role: string;
					points?: number;
					nexusCount?: number;
					joinedAt?: string | null;
			  }>
			| 'loading'
			| 'error'
		>
	>({});

	const toggleFactionExpanded = useCallback(
		async (factionId: number) => {
			setExpandedFactionId((prev) => (prev === factionId ? null : factionId));
			if (factionMemberCache[factionId] !== undefined) return;
			setFactionMemberCache((prev) => ({ ...prev, [factionId]: 'loading' }));
			try {
				const res = await getFaction(factionId);
				const members = (res.data?.members ?? []).map(
					(m: {
						userId: number;
						username: string;
						isSupporter?: boolean;
						supporterTier?: string | null;
						role: string;
						points?: number;
						nexusCount?: number;
						joinedAt?: string | null;
					}) => ({
						userId: m.userId,
						username: m.username,
						isSupporter: !!m.isSupporter,
						supporterTier: m.supporterTier ?? null,
						role: m.role,
						points: m.points ?? 0,
						nexusCount: m.nexusCount ?? 0,
						joinedAt: m.joinedAt ?? null
					})
				);
				setFactionMemberCache((prev) => ({ ...prev, [factionId]: members }));
			} catch {
				setFactionMemberCache((prev) => ({ ...prev, [factionId]: 'error' }));
			}
		},
		[factionMemberCache]
	);

	const { user: authUser } = useAuth();
	const badges = useBadgesQuery();
	const currentUserId = authUser ? parseInt(authUser.id, 10) : undefined;

	const refreshJoinRequests = useCallback(async (factionId: number) => {
		try {
			const res = await getFactionJoinRequests(factionId);
			setJoinRequests(res.data);
		} catch {
			setJoinRequestsError('Failed to load join requests');
		}
	}, []);

	useEffect(() => {
		const fetchData = async () => {
			try {
				const [myFactionRes, invitesRes] = await Promise.all([
					getMyFaction(),
					getMyFactionInvites()
				]);
				const faction = myFactionRes.data.faction;
				setMyFaction(faction);
				setInvites(invitesRes.data);
				if (faction?.motd) setMotdDraft(faction.motd);
				if (faction) {
					const [warsRes, factionsRes, treatiesRes, galaxyDipRes] = await Promise.all([
						getFactionWars(faction.id),
						listFactionsInGalaxy(),
						getActiveTreaties(faction.id),
						getGalaxyDiplomacy()
					]);
					setWars(warsRes.data);
					setGalaxyFactions(factionsRes.data.filter((f: GalaxyFaction) => f.id !== faction.id));
					setTreaties(treatiesRes.data ?? []);
					setGalaxyTreaties(galaxyDipRes.data ?? []);
					if (faction.myRole === 'leader' || faction.myRole === 'officer') {
						await refreshJoinRequests(faction.id);
					}
				} else {
					const [factionsRes, myReqRes] = await Promise.all([
						listFactionsInGalaxy(),
						getMyFactionJoinRequests()
					]);
					setAllGalaxyFactions(factionsRes.data);
					setMyJoinRequests(myReqRes.data);
				}
			} catch (err) {
				setError((err as Error).message);
			} finally {
				setLoading(false);
			}
		};
		fetchData();
	}, [refreshJoinRequests]);

	const refreshWars = async (factionId: number) => {
		const res = await getFactionWars(factionId);
		setWars(res.data);
	};

	const refreshFaction = async () => {
		const res = await getMyFaction();
		setMyFaction(res.data.faction);
		if (res.data.faction?.motd) setMotdDraft(res.data.faction.motd);
	};

	const handleCreateFaction = async (e: React.FormEvent) => {
		e.preventDefault();
		setFormError('');
		setFormSubmitting(true);
		try {
			await createFaction({ name: formName, tag: formTag, description: formDesc });
			// Founding-hero context gets a brief success flourish before the view
			// transitions to the in-faction screen.
			if (isFoundingCreate) {
				setFoundingSuccess(true);
				await new Promise<void>((r) => setTimeout(r, 600));
			}
			await refreshFaction();
			setShowCreateForm(false);
			setIsFoundingCreate(false);
			setFoundingSuccess(false);
			setFormName('');
			setFormTag('');
			setFormDesc('');
		} catch (err) {
			setFoundingSuccess(false);
			setFormError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		} finally {
			setFormSubmitting(false);
		}
	};

	const handleInvite = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!myFaction) return;
		setInviteError('');
		setInviteSubmitting(true);
		try {
			await inviteToFaction(myFaction.id, inviteUsername);
			setInviteUsername('');
		} catch (err) {
			setInviteError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		} finally {
			setInviteSubmitting(false);
		}
	};

	const handleAcceptInvite = async (inviteId: number) => {
		try {
			await acceptFactionInvite(inviteId);
			setInvites(invites.filter((i) => i.id !== inviteId));
			await refreshFaction();
			if (isJoinFactionOnboarding) advanceOnboarding();
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleDeclineInvite = async (inviteId: number) => {
		try {
			await declineFactionInvite(inviteId);
			setInvites(invites.filter((i) => i.id !== inviteId));
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleKickMember = async (userId: number, username: string) => {
		if (!myFaction || !confirm(`Kick ${username} from the faction?`)) return;
		try {
			await kickFactionMember(myFaction.id, userId);
			await refreshFaction();
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleTransferLeader = async (userId: number, username: string) => {
		if (
			!myFaction ||
			!confirm(
				`Transfer leadership to ${username}? You will become a regular member. This cannot be undone.`
			)
		)
			return;
		try {
			await transferFactionLeader(myFaction.id, userId);
			await refreshFaction();
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handlePromoteOfficer = async (userId: number) => {
		if (!myFaction) return;
		try {
			await setFactionMemberRole(myFaction.id, userId, 'officer');
			await refreshFaction();
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleDemoteOfficer = async (userId: number) => {
		if (!myFaction) return;
		try {
			await setFactionMemberRole(myFaction.id, userId, 'member');
			await refreshFaction();
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleLeaveFaction = async () => {
		if (!myFaction || !confirm('Are you sure you want to leave this faction?')) return;
		try {
			await leaveFaction(myFaction.id);
			setMyFaction(null);
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleDisbandFaction = async () => {
		if (
			!myFaction ||
			!confirm('Are you sure you want to disband this faction? This cannot be undone.')
		)
			return;
		try {
			await disbandFaction(myFaction.id);
			setMyFaction(null);
		} catch (err) {
			setError((err as Error).message);
		}
	};

	const handleSaveMotd = async () => {
		if (!myFaction) return;
		setMotdSubmitting(true);
		setMotdError('');
		try {
			await updateFactionMotd(myFaction.id, motdDraft);
			await refreshFaction();
			setEditingMotd(false);
		} catch (err) {
			setMotdError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					'Failed to save'
			);
		} finally {
			setMotdSubmitting(false);
		}
	};

	const handleDeclareWar = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!myFaction || !selectedDeclareTarget) return;
		setWarError('');
		setWarSubmitting(true);
		try {
			await declareWar(myFaction.id, parseInt(selectedDeclareTarget));
			setSelectedDeclareTarget('');
			await refreshWars(myFaction.id);
		} catch (err) {
			setWarError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		} finally {
			setWarSubmitting(false);
		}
	};

	const handleProposeCeasefire = async (warId: number) => {
		if (!myFaction) return;
		try {
			await proposeCeasefire(warId);
			await refreshWars(myFaction.id);
		} catch (err) {
			setWarError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	const handleAcceptCeasefire = async (warId: number) => {
		if (!myFaction) return;
		try {
			await acceptCeasefire(warId);
			await refreshWars(myFaction.id);
		} catch (err) {
			setWarError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	const handleDeclineCeasefire = async (warId: number) => {
		if (!myFaction) return;
		try {
			await declineCeasefire(warId);
			await refreshWars(myFaction.id);
		} catch (err) {
			setWarError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	// ── Treaty handlers ──────────────────────────────────────────────────────────

	const refreshTreaties = async (factionId: number) => {
		try {
			const [treatiesRes, galaxyDipRes] = await Promise.all([
				getActiveTreaties(factionId),
				getGalaxyDiplomacy()
			]);
			setTreaties(treatiesRes.data ?? []);
			setGalaxyTreaties(galaxyDipRes.data ?? []);
		} catch {}
	};

	const handleProposeTreaty = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!myFaction || !treatyTarget) return;
		setTreatySubmitting(true);
		setTreatyError('');
		try {
			await proposeTreaty(myFaction.id, parseInt(treatyTarget), treatyType, treatyDuration);
			setTreatyTarget('');
			await refreshTreaties(myFaction.id);
		} catch (err) {
			setTreatyError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		} finally {
			setTreatySubmitting(false);
		}
	};

	const handleAcceptTreaty = async (treatyId: number) => {
		if (!myFaction) return;
		try {
			await acceptTreaty(treatyId);
			await refreshTreaties(myFaction.id);
		} catch (err) {
			setTreatyError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	const handleCancelTreaty = async (treatyId: number) => {
		if (!myFaction) return;
		try {
			await cancelTreaty(treatyId);
			await refreshTreaties(myFaction.id);
		} catch (err) {
			setTreatyError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	// Open the break-pact confirm modal for a treaty (clears any prior inline error).
	const openBreakPactModal = (treatyId: number, targetLabel: string) => {
		setBreakNapError(null);
		setBreakNapModal({ treatyId, targetLabel });
	};

	// Break an active NAP. The confirm + warning copy live in BreakPactModal (a
	// deliberate act-of-war dialog, not a native confirm). The betrayal window and
	// resign cooldown are computed server-side; the client only consumes the
	// server-returned `betrayalEndsAt` timestamp shown in the countdown.
	const handleBreakNap = async (treatyId: number) => {
		if (!myFaction) return;
		setBreakNapSubmitting(treatyId);
		setBreakNapError(null);
		try {
			await breakNap(treatyId);
			await refreshTreaties(myFaction.id);
			setBreakNapModal(null);
		} catch (err) {
			setBreakNapError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					'Failed to break pact'
			);
		} finally {
			setBreakNapSubmitting(null);
		}
	};

	// ── Join-request handlers (player without faction) ──────────────────────────

	const handleRequestToJoin = async (factionId: number) => {
		setJoinRequestSubmitting((prev) => ({ ...prev, [factionId]: true }));
		setJoinRequestError((prev) => ({ ...prev, [factionId]: '' }));
		try {
			await requestToJoinFaction(factionId, joinRequestMsg[factionId]);
			const res = await getMyFactionJoinRequests();
			setMyJoinRequests(res.data);
			setJoinRequestMsg((prev) => ({ ...prev, [factionId]: '' }));
			if (isJoinFactionOnboarding) advanceOnboarding();
		} catch (err) {
			setJoinRequestError((prev) => ({
				...prev,
				[factionId]:
					(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			}));
		} finally {
			setJoinRequestSubmitting((prev) => ({ ...prev, [factionId]: false }));
		}
	};

	const handleCancelJoinRequest = async (factionId: number) => {
		try {
			await cancelFactionJoinRequest(factionId);
			setMyJoinRequests((prev) => prev.filter((r) => r.factionId !== factionId));
		} catch (err) {
			setError((err as Error).message);
		}
	};

	// ── Join-request handlers (leader/officer inside faction) ───────────────────

	const handleApproveJoinRequest = async (requestId: number) => {
		if (!myFaction) return;
		try {
			await approveJoinRequest(myFaction.id, requestId);
			await Promise.all([refreshFaction(), refreshJoinRequests(myFaction.id)]);
		} catch (err) {
			setJoinRequestsError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	const handleDeclineJoinRequest = async (requestId: number) => {
		if (!myFaction) return;
		try {
			await declineJoinRequest(myFaction.id, requestId);
			setJoinRequests((prev) => prev.filter((r) => r.id !== requestId));
		} catch (err) {
			setJoinRequestsError(
				(err as { response?: { data?: { error?: string } } }).response?.data?.error ||
					(err as Error).message
			);
		}
	};

	// ── Loading / error ─────────────────────────────────────────────────────────

	if (loading) {
		return <PageSkeleton variant="rows" count={6} />;
	}

	// ── No faction: cold-start hero or recruiting list ───────────────────────────

	if (!myFaction) {
		const pendingFactionIds = new Set(myJoinRequests.map((r) => r.factionId));

		// Zero factions = founding wave. Show the founding hero (3A).
		const isFoundingWave = allGalaxyFactions.length === 0;

		// For populated state (3B): recommend up to 3 joinable factions, ranked
		// by ascending memberCount so a new member feels impactful.
		const joinableFactions = allGalaxyFactions.filter((f) => !pendingFactionIds.has(f.id));
		const recommendedFactions = [...joinableFactions]
			.sort((a, b) => a.memberCount - b.memberCount)
			.slice(0, 3);
		// If factions exist but none are joinable (all pending), promote "Found
		// Your Own" back to primary -- mirrors the "all full" fallback in the spec.
		const allFullOrPending = !isFoundingWave && joinableFactions.length === 0;

		// Derive a smart default name + tag from the player's username.
		const handleFoundYourFaction = () => {
			const username = authUser?.username ?? '';
			const defaultName = username ? `${username} Vanguard` : '';
			// First 3-4 alphanumeric chars of username, uppercased, clamped 2-6.
			const raw = username.replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase();
			const defaultTag = raw.length >= 2 ? raw : raw.padEnd(2, 'X');
			setFormName(defaultName);
			setFormTag(defaultTag);
			setFormDesc('');
			setFormError('');
			setIsFoundingCreate(true);
			setShowCreateForm(true);
		};

		const handleOpenSecondaryCreate = () => {
			setFormName('');
			setFormTag('');
			setFormDesc('');
			setFormError('');
			setIsFoundingCreate(false);
			setShowCreateForm((prev) => !prev);
		};

		// Shared create form used in both the founding (3A) and populated (3B) contexts.
		const createFormSection = showCreateForm && (
			<section
				className={`factions-panel factions-create-form${isFoundingCreate ? ' factions-hero-form' : ''}`}
			>
				<h2>{isFoundingCreate ? 'Raise Your Banner' : 'Create a New Faction'}</h2>
				<form onSubmit={handleCreateFaction}>
					<label className="factions-field">
						<span className="factions-label">Faction Name</span>
						<input
							type="text"
							value={formName}
							onChange={(e) => setFormName(e.target.value)}
							placeholder="e.g. Vexara Collective"
							disabled={formSubmitting}
							required
							autoCorrect="off"
							spellCheck={false}
						/>
					</label>
					<label className="factions-field">
						<span className="factions-label">Tag (2-6 characters)</span>
						<input
							type="text"
							value={formTag}
							onChange={(e) => setFormTag(e.target.value.toUpperCase())}
							placeholder="e.g. VEX"
							maxLength={6}
							disabled={formSubmitting}
							required
							autoCapitalize="characters"
							autoCorrect="off"
							spellCheck={false}
						/>
					</label>
					<label className="factions-field">
						<span className="factions-label">Description (optional)</span>
						<textarea
							value={formDesc}
							onChange={(e) => setFormDesc(e.target.value)}
							placeholder="Tell us about your faction..."
							rows={3}
							disabled={formSubmitting}
						/>
					</label>
					{formError && <div className="factions-field-error">{formError}</div>}
					<button type="submit" disabled={formSubmitting} className="factions-btn-primary">
						{formSubmitting
							? isFoundingCreate
								? 'Raising...'
								: 'Creating...'
							: isFoundingCreate
								? 'Raise the Banner'
								: 'Create Faction'}
					</button>
				</form>
			</section>
		);

		// Full factions browser (all factions, expandable member lists).
		const fullBrowserSection = (
			<section className="factions-panel factions-browser">
				<h2>All Factions ({allGalaxyFactions.length})</h2>
				<div className="factions-browser-list">
					{allGalaxyFactions.map((f) => {
						const hasPending = pendingFactionIds.has(f.id);
						const submitting = joinRequestSubmitting[f.id] ?? false;
						const reqError = joinRequestError[f.id] ?? '';
						const isExpanded = expandedFactionId === f.id;
						const cachedMembers = factionMemberCache[f.id];
						return (
							<div key={f.id} className="factions-browser-card">
								<div className="factions-browser-card-header">
									<div className="factions-browser-card-identity">
										<button
											type="button"
											className="factions-browser-card-name factions-browser-card-name-button"
											onClick={() => toggleFactionExpanded(f.id)}
											aria-expanded={isExpanded}
											aria-controls={`faction-members-${f.id}`}
										>
											{f.name}
										</button>
										<span className="factions-browser-card-tag">[{f.tag}]</span>
									</div>
									<span className="factions-browser-card-members">
										{f.memberCount} member{f.memberCount !== 1 ? 's' : ''}
									</span>
								</div>
								{f.description && <p className="factions-browser-card-desc">{f.description}</p>}
								{isExpanded && (
									<div
										className="factions-browser-card-members-panel"
										id={`faction-members-${f.id}`}
									>
										{cachedMembers === 'loading' && (
											<span className="factions-browser-card-members-status">
												Loading members...
											</span>
										)}
										{cachedMembers === 'error' && (
											<span className="factions-browser-card-members-status factions-field-error">
												Failed to load members.
											</span>
										)}
										{Array.isArray(cachedMembers) && cachedMembers.length === 0 && (
											<span className="factions-browser-card-members-status">
												This faction has no members.
											</span>
										)}
										{Array.isArray(cachedMembers) && cachedMembers.length > 0 && (
											<ul className="factions-browser-card-members-list">
												{cachedMembers.map((m) => (
													<li key={m.userId} className="factions-browser-card-members-item">
														<div className="factions-browser-card-member-main">
															<Username
																name={m.username}
																isSupporter={m.isSupporter}
																supporterTier={m.supporterTier as any}
																linkToProfile
															/>
															<span
																className={`factions-role-badge factions-role-badge--${m.role}`}
															>
																{m.role}
															</span>
														</div>
														<div className="factions-browser-card-member-stats">
															<span>{(m.points ?? 0).toLocaleString()} inf</span>
															<span>
																{m.nexusCount ?? 0} nexus{(m.nexusCount ?? 0) !== 1 ? 'es' : ''}
															</span>
														</div>
													</li>
												))}
											</ul>
										)}
									</div>
								)}
								{hasPending ? (
									<div className="factions-browser-card-pending">
										<span className="factions-join-req-status">Request pending</span>
										<button
											className="factions-btn-small factions-btn-danger"
											onClick={() => handleCancelJoinRequest(f.id)}
										>
											Cancel
										</button>
									</div>
								) : (
									<div className="factions-browser-card-join">
										<input
											className="factions-join-req-msg"
											type="text"
											placeholder="Optional message to leader..."
											value={joinRequestMsg[f.id] ?? ''}
											onChange={(e) =>
												setJoinRequestMsg((prev) => ({ ...prev, [f.id]: e.target.value }))
											}
											maxLength={256}
											disabled={submitting}
										/>
										<button
											className="factions-btn-primary factions-btn-join"
											disabled={submitting}
											onClick={() => handleRequestToJoin(f.id)}
										>
											{submitting ? 'Requesting...' : 'Request to Join'}
										</button>
									</div>
								)}
								{reqError && <div className="factions-field-error">{reqError}</div>}
							</div>
						);
					})}
				</div>
			</section>
		);

		return (
			<div className="factions-container">
				{error && (
					<div className="factions-error" role="alert">
						{error}
					</div>
				)}

				{/* Pending invites - spotlight preferred over hero CTA for Flow C */}
				{invites.length > 0 && (
					<section className="factions-panel factions-invites">
						<h2>Pending Invites ({invites.length})</h2>
						<div className="factions-invite-list">
							{invites.map((invite) => (
								<div key={invite.id} className="factions-invite-item">
									<div className="factions-invite-info">
										<strong>{invite.factionName}</strong>
										<span className="factions-invite-tag">[{invite.factionTag}]</span>
										<p>Invited by {invite.invitedByUsername}</p>
									</div>
									<div className="factions-invite-actions">
										<button
											className="factions-btn-primary"
											onClick={() => handleAcceptInvite(invite.id)}
											data-onboarding="join-faction"
										>
											Accept
										</button>
										<button
											className="factions-btn-danger"
											onClick={() => handleDeclineInvite(invite.id)}
										>
											Decline
										</button>
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{/* My pending join requests */}
				{myJoinRequests.length > 0 && (
					<section className="factions-panel factions-join-requests-sent">
						<h2>Pending Join Requests</h2>
						<div className="factions-invite-list">
							{myJoinRequests.map((req) => (
								<div key={req.id} className="factions-invite-item">
									<div className="factions-invite-info">
										<strong>{req.factionName}</strong>
										<span className="factions-invite-tag">[{req.factionTag}]</span>
										<p className="factions-join-req-status">Awaiting leader approval</p>
									</div>
									<div className="factions-invite-actions">
										<button
											className="factions-btn-small factions-btn-danger"
											onClick={() => handleCancelJoinRequest(req.factionId)}
										>
											Cancel
										</button>
									</div>
								</div>
							))}
						</div>
					</section>
				)}

				{isFoundingWave ? (
					/* 3A: Zero factions -- founding hero ──────────────────────────── */
					<>
						<section
							className={`factions-panel factions-hero${foundingSuccess ? ' factions-hero--success' : ''}`}
						>
							<p className="factions-hero-eyebrow">THE WAR COUNCIL</p>
							<h2>
								{galaxyName
									? `Be the first faction in ${galaxyName}`
									: 'Be the first faction in this galaxy'}
							</h2>
							<p className="factions-hero-lede">
								No factions exist here yet, so the founder's seat is open. Found it, and every
								commander who lands in this galaxy can rally under your banner.
							</p>
							<div className="factions-unlock-chips" aria-label="Faction perks">
								<span className="factions-unlock-chip">War Room</span>
								<span className="factions-unlock-chip">Shared Chat</span>
								<span className="factions-unlock-chip">Allied Garrisons</span>
								<span className="factions-unlock-chip">Hall of Champions</span>
							</div>
							<button
								className="factions-btn-primary factions-hero-cta"
								onClick={handleFoundYourFaction}
								data-onboarding="join-faction"
							>
								<Flag size={14} aria-hidden="true" />
								Found Your Faction
							</button>
						</section>

						{createFormSection}
					</>
				) : allFullOrPending ? (
					/* 3B fallback: all factions full -- promote Found Your Own ─────── */
					<>
						<section
							className={`factions-panel factions-hero${foundingSuccess ? ' factions-hero--success' : ''}`}
						>
							<p className="factions-hero-eyebrow">THE WAR COUNCIL</p>
							<h2>
								{galaxyName
									? `Choose your side in ${galaxyName}`
									: 'Choose your side'}
							</h2>
							<p className="factions-hero-lede">
								All existing factions are full or have your request pending. Found your own and
								lead it -- every commander who joins can rally under your banner.
							</p>
							<div className="factions-unlock-chips" aria-label="Faction perks">
								<span className="factions-unlock-chip">War Room</span>
								<span className="factions-unlock-chip">Shared Chat</span>
								<span className="factions-unlock-chip">Allied Garrisons</span>
								<span className="factions-unlock-chip">Hall of Champions</span>
							</div>
							<button
								className="factions-btn-primary factions-hero-cta"
								onClick={handleFoundYourFaction}
								data-onboarding="join-faction"
							>
								<Flag size={14} aria-hidden="true" />
								Found Your Own Faction
							</button>
						</section>

						{createFormSection}

						{fullBrowserSection}

						<section className="factions-panel factions-all">
							<h2>Galaxy Standings</h2>
							<FactionLeaderboard />
						</section>
					</>
				) : (
					/* 3B: Factions exist, join slots available -- recruiting list ─── */
					<>
						{/* Recruiting Now header */}
						<section className="factions-panel factions-create-form factions-recruiting-panel">
							<p className="factions-hero-eyebrow">THE WAR COUNCIL</p>
							<h2>
								{galaxyName
									? `Choose your side in ${galaxyName}`
									: 'Choose your side'}
							</h2>

							<p className="factions-recruiting-label">RECRUITING NOW</p>
							<div className="factions-recruiting-list">
								{recommendedFactions.map((f, idx) => {
									const isFirst = idx === 0;
									const hasPending = pendingFactionIds.has(f.id);
									const submitting = joinRequestSubmitting[f.id] ?? false;
									const reqError = joinRequestError[f.id] ?? '';
									const noteOpen = showJoinNote[f.id] ?? false;
									return (
										<div key={f.id} className="factions-recruiting-card">
											<div className="factions-recruiting-card-header">
												<span className="factions-tag">{f.tag}</span>
												<span className="factions-recruiting-card-name">{f.name}</span>
												<span className="factions-recruiting-mark" aria-hidden="true" />
												<span className="factions-recruiting-mark-label">recruiting</span>
											</div>
											{f.description && (
												<p className="factions-recruiting-card-desc">{f.description}</p>
											)}
											<div className="factions-recruiting-card-meta">
												<span className="factions-recruiting-card-members">
													{f.memberCount} member{f.memberCount !== 1 ? 's' : ''}
												</span>
											</div>
											{hasPending ? (
												<div className="factions-browser-card-pending">
													<span className="factions-join-req-status">Request pending</span>
													<button
														className="factions-btn-small factions-btn-danger"
														onClick={() => handleCancelJoinRequest(f.id)}
													>
														Cancel
													</button>
												</div>
											) : (
												<div className="factions-recruiting-card-actions">
													{noteOpen && (
														<input
															className="factions-join-req-msg factions-recruiting-note-input"
															type="text"
															placeholder="Say something to the leader (optional)..."
															value={joinRequestMsg[f.id] ?? ''}
															onChange={(e) =>
																setJoinRequestMsg((prev) => ({
																	...prev,
																	[f.id]: e.target.value
																}))
															}
															maxLength={256}
															disabled={submitting}
														/>
													)}
													<div className="factions-recruiting-card-cta-row">
														<button
															className="factions-btn-primary factions-recruiting-join-btn"
															disabled={submitting}
															onClick={() => handleRequestToJoin(f.id)}
															{...(isFirst && invites.length === 0
																? { 'data-onboarding': 'join-faction' }
																: {})}
														>
															{submitting ? 'Joining...' : 'Join'}
														</button>
														{!noteOpen && (
															<button
																type="button"
																className="factions-recruiting-note-toggle"
																onClick={() =>
																	setShowJoinNote((prev) => ({
																		...prev,
																		[f.id]: true
																	}))
																}
																disabled={submitting}
															>
																add a note
															</button>
														)}
													</div>
												</div>
											)}
											{reqError && <div className="factions-field-error">{reqError}</div>}
										</div>
									);
								})}
							</div>

							{/* Secondary: Found Your Own */}
							<div className="factions-found-secondary">
								<button
									type="button"
									className="factions-btn-small factions-found-secondary-btn"
									onClick={handleOpenSecondaryCreate}
								>
									{showCreateForm && !isFoundingCreate ? 'Cancel' : 'Found Your Own Faction'}
								</button>
							</div>
						</section>

						{/* Create form (secondary create path) */}
						{createFormSection}

						{/* Full browser below the fold */}
						{fullBrowserSection}

						<section className="factions-panel factions-all">
							<h2>Galaxy Standings</h2>
							<FactionLeaderboard />
						</section>
					</>
				)}
			</div>
		);
	}

	// ── In a faction ─────────────────────────────────────────────────────────────

	const canManage = myFaction.myRole === 'leader' || myFaction.myRole === 'officer';
	const factionNoticeItems = [
		badges.factionUnreadChat > 0
			? { key: 'chat', label: 'Chat', count: badges.factionUnreadChat, tab: 'chat' as Tab }
			: null,
		canManage && badges.factionPendingJoinRequests > 0
			? {
					key: 'members',
					label: 'Requests',
					count: badges.factionPendingJoinRequests,
					tab: 'members' as Tab
				}
			: null,
		badges.factionUnseenWars > 0
			? { key: 'wars', label: 'Wars', count: badges.factionUnseenWars, tab: 'wars' as Tab }
			: null,
		canManage && badges.factionPendingTreaties > 0
			? {
					key: 'diplomacy',
					label: 'Diplomacy',
					count: badges.factionPendingTreaties,
					tab: 'diplomacy' as Tab
				}
			: null
	].filter(Boolean) as Array<{ key: string; label: string; count: number; tab: Tab }>;
	const sortedMembers = [...(myFaction.members ?? [])].sort(
		(a, b) => (ROLE_ORDER[a.role] ?? 3) - (ROLE_ORDER[b.role] ?? 3)
	);

	return (
		<div className="factions-container">
			{error && (
				<div className="factions-error" role="alert">
					{error}
				</div>
			)}

			{/* Header */}
			<div className="factions-header">
				<div className="factions-header-name">
					<h1>{myFaction.name}</h1>
					<span className="factions-tag factions-tag--lg">{myFaction.tag}</span>
				</div>
				<div className="factions-header-meta">
					<span className={`factions-role-badge factions-role-badge--${myFaction.myRole}`}>
						{myFaction.myRole}
					</span>
					<span className="factions-member-count">{myFaction.members?.length ?? 0} members</span>
				</div>
			</div>

			{/* MOTD */}
			<div className="factions-motd-area">
				{editingMotd ? (
					<div className="factions-motd-editor">
						<textarea
							className="factions-motd-input"
							value={motdDraft}
							onChange={(e) => setMotdDraft(e.target.value)}
							placeholder="Set a message of the day for your faction..."
							rows={3}
							maxLength={512}
							disabled={motdSubmitting}
						/>
						<div className="factions-motd-editor-actions">
							{motdError && <span className="factions-field-error">{motdError}</span>}
							<button className="factions-btn-small" onClick={() => setEditingMotd(false)}>
								Cancel
							</button>
							<button
								className="factions-btn-primary"
								onClick={handleSaveMotd}
								disabled={motdSubmitting}
							>
								{motdSubmitting ? 'Saving...' : 'Save MOTD'}
							</button>
						</div>
					</div>
				) : (
					<div className="factions-motd-display">
						{myFaction.motd ? (
							<p className="factions-motd-text">{myFaction.motd}</p>
						) : (
							<p className="factions-motd-empty">No message of the day set.</p>
						)}
						{canManage && (
							<button
								className="factions-btn-small"
								onClick={() => {
									setMotdDraft(myFaction.motd ?? '');
									setEditingMotd(true);
								}}
							>
								{myFaction.motd ? 'Edit MOTD' : 'Set MOTD'}
							</button>
						)}
					</div>
				)}
			</div>

			{factionNoticeItems.length > 0 && (
				<div className="factions-notice-strip" aria-label="Faction notifications">
					{factionNoticeItems.map((item) => (
						<button
							key={item.key}
							type="button"
							className="factions-notice-chip"
							onClick={() => setActiveTab(item.tab)}
						>
							<span className="factions-notice-mark" aria-hidden="true" />
							<span>{item.label}</span>
							<span className="factions-notice-count">{item.count}</span>
						</button>
					))}
				</div>
			)}

			{/* Tabs */}
			<div className="factions-tabs">
				{(
					[
						'overview',
						'chat',
						'warroom',
						'members',
						'wars',
						'diplomacy',
						'galaxy',
						'activity'
					] as Tab[]
				).map((tab) => (
					<button
						key={tab}
						className={`factions-tab${activeTab === tab ? ' factions-tab--active' : ''}`}
						onClick={() => setActiveTab(tab)}
					>
						{tab === 'overview' && 'Overview'}
						{tab === 'chat' && (
							<>
								Chat
								{badges.factionUnreadChat > 0 && (
									<span className="factions-tab-badge factions-tab-badge--alert">
										{badges.factionUnreadChat}
									</span>
								)}
							</>
						)}
						{tab === 'warroom' && 'War Room'}
						{tab === 'members' && (
							<>
								Members ({myFaction.members?.length ?? 0})
								{canManage && joinRequests.length > 0 && (
									<span className="factions-tab-badge factions-tab-badge--alert">
										{joinRequests.length}
									</span>
								)}
							</>
						)}
						{tab === 'activity' && 'Activity'}
						{tab === 'galaxy' && `Galaxy (${galaxyFactions.length})`}
						{tab === 'wars' && (
							<>
								Wars
								{wars.filter((w) => w.status === 'active').length > 0 && (
									<span className="factions-tab-badge">
										{wars.filter((w) => w.status === 'active').length}
									</span>
								)}
								{(wars.some((w) => w.status === 'pending' && w.targetFactionId === myFaction.id) ||
									wars.some(
										(w) =>
											w.status === 'ceasefire_pending' &&
											w.ceasefireProposerFactionId !== myFaction.id
									)) && <span className="factions-tab-badge factions-tab-badge--alert">!</span>}
							</>
						)}
						{tab === 'diplomacy' && (
							<>
								Diplomacy
								{treaties.some(
									(t) => t.status === 'pending' && t.targetFactionId === myFaction.id
								) && <span className="factions-tab-badge factions-tab-badge--alert">!</span>}
							</>
						)}
					</button>
				))}
			</div>

			{/* Tab: Overview */}
			{activeTab === 'overview' && (
				<section className="factions-panel factions-tab-content">
					{myFaction.description && (
						<div className="factions-overview-section">
							<h3>About</h3>
							<p className="factions-description">{myFaction.description}</p>
						</div>
					)}

					<div className="factions-overview-section">
						<h3>Roster Preview</h3>
						<div className="factions-member-list">
							{sortedMembers.slice(0, 5).map((member) => (
								<div key={member.id} className="factions-member-row">
									<div className="factions-member-info">
										<span className="factions-member-name">
											<Username
												name={member.username}
												isSupporter={member.isSupporter}
												supporterTier={member.supporterTier as any}
												linkToProfile
											/>
										</span>
										<span className={`factions-member-role factions-member-role--${member.role}`}>
											{member.role}
										</span>
									</div>
								</div>
							))}
							{sortedMembers.length > 5 && (
								<button className="factions-see-all" onClick={() => setActiveTab('members')}>
									See all {sortedMembers.length} members →
								</button>
							)}
						</div>
					</div>

					<div className="factions-overview-stats">
						<div className="factions-stat">
							<span className="factions-stat-value">{myFaction.members?.length ?? 0}</span>
							<span className="factions-stat-label">Members</span>
						</div>
						<div className="factions-stat">
							<span className="factions-stat-value">
								{myFaction.members?.filter((m) => m.role === 'officer' || m.role === 'leader')
									.length ?? 0}
							</span>
							<span className="factions-stat-label">Officers</span>
						</div>
						<div className="factions-stat">
							<span className="factions-stat-value">
								{new Date(myFaction.createdAt).toLocaleDateString([], {
									month: 'short',
									day: 'numeric',
									year: 'numeric'
								})}
							</span>
							<span className="factions-stat-label">Founded</span>
						</div>
					</div>

					<div className="factions-overview-section">
						<h3>Galaxy Standings</h3>
						<FactionLeaderboard myFactionId={myFaction.id} />
					</div>

					<div className="factions-actions">
						{myFaction.myRole === 'leader' ? (
							<button className="factions-btn-danger" onClick={handleDisbandFaction}>
								Disband Faction
							</button>
						) : (
							<button className="factions-btn-danger" onClick={handleLeaveFaction}>
								Leave Faction
							</button>
						)}
					</div>
				</section>
			)}

			{/* Tab: Chat */}
			{activeTab === 'chat' && (
				<section className="factions-panel factions-tab-content factions-tab-content--chat">
					<FactionChat factionId={myFaction.id} currentUserId={currentUserId} />
				</section>
			)}

			{/* Tab: War Room */}
			{activeTab === 'warroom' && (
				<section className="factions-panel factions-tab-content factions-tab-content--chat">
					<WarRoom
						factionId={myFaction.id}
						myRole={myFaction.myRole as 'leader' | 'officer' | 'member'}
					/>
				</section>
			)}

			{/* Tab: Members */}
			{activeTab === 'members' && (
				<section className="factions-panel factions-tab-content">
					{/* Join requests (leader/officer only) */}
					{canManage && (
						<div className="factions-join-requests-section">
							<h3>
								Join Requests
								{joinRequests.length > 0 && (
									<span
										className="factions-tab-badge factions-tab-badge--alert"
										style={{ marginLeft: 8 }}
									>
										{joinRequests.length}
									</span>
								)}
							</h3>
							{joinRequestsError && <div className="factions-field-error">{joinRequestsError}</div>}
							{joinRequests.length === 0 ? (
								<p className="factions-join-requests-empty">No pending join requests.</p>
							) : (
								<div className="factions-member-list">
									{joinRequests.map((req) => (
										<div key={req.id} className="factions-member-row factions-join-req-row">
											<div className="factions-member-info">
												<span className="factions-member-name">
													<Username
														name={req.username}
														isSupporter={req.isSupporter}
														supporterTier={req.supporterTier as any}
														linkToProfile
													/>
												</span>
												{req.message && (
													<span className="factions-join-req-msg-display">
														&ldquo;{req.message}&rdquo;
													</span>
												)}
											</div>
											<div className="factions-member-actions">
												<button
													className="factions-btn-primary"
													onClick={() => handleApproveJoinRequest(req.id)}
												>
													Approve
												</button>
												<button
													className="factions-btn-small factions-btn-danger"
													onClick={() => handleDeclineJoinRequest(req.id)}
												>
													Decline
												</button>
											</div>
										</div>
									))}
								</div>
							)}
						</div>
					)}

					{/* Invite member */}
					{canManage && (
						<form onSubmit={handleInvite} className="factions-invite-form">
							<h3>Invite Member</h3>
							<div className="factions-invite-inline">
								<input
									type="text"
									value={inviteUsername}
									onChange={(e) => setInviteUsername(e.target.value)}
									placeholder="Enter username"
									disabled={inviteSubmitting}
									autoCapitalize="none"
									autoCorrect="off"
									spellCheck={false}
								/>
								<button type="submit" disabled={inviteSubmitting} className="factions-btn-primary">
									{inviteSubmitting ? 'Inviting...' : 'Send Invite'}
								</button>
							</div>
							{inviteError && <div className="factions-field-error">{inviteError}</div>}
						</form>
					)}

					<div className="factions-member-list">
						{sortedMembers.map((member) => (
							<div key={member.id} className="factions-member-row">
								<div className="factions-member-info">
									<span className="factions-member-name">
										<Username
											name={member.username}
											isSupporter={member.isSupporter}
											supporterTier={member.supporterTier as any}
											linkToProfile
										/>
									</span>
									<span className={`factions-member-role factions-member-role--${member.role}`}>
										{member.role}
									</span>
									{member.lastPlayedAt &&
										(myFaction.myRole === 'leader' || myFaction.myRole === 'officer') && (
											<span
												className="factions-member-last-played"
												title={new Date(member.lastPlayedAt).toLocaleString()}
											>
												Last seen: {formatRelativeTime(member.lastPlayedAt)}
											</span>
										)}
								</div>
								{myFaction.myRole === 'leader' && member.role !== 'leader' && (
									<div className="factions-member-actions">
										{member.role === 'member' ? (
											<button
												className="factions-btn-small"
												onClick={() => handlePromoteOfficer(member.userId)}
											>
												Promote
											</button>
										) : (
											<button
												className="factions-btn-small"
												onClick={() => handleDemoteOfficer(member.userId)}
											>
												Demote
											</button>
										)}
										<button
											className="factions-btn-small"
											onClick={() => handleTransferLeader(member.userId, member.username)}
										>
											Make Leader
										</button>
										<button
											className="factions-btn-small factions-btn-danger"
											onClick={() => handleKickMember(member.userId, member.username)}
										>
											Kick
										</button>
									</div>
								)}
								{myFaction.myRole === 'officer' && member.role === 'member' && (
									<div className="factions-member-actions">
										<button
											className="factions-btn-small factions-btn-danger"
											onClick={() => handleKickMember(member.userId, member.username)}
										>
											Kick
										</button>
									</div>
								)}
							</div>
						))}
					</div>
				</section>
			)}

			{/* Tab: Activity */}
			{activeTab === 'activity' && (
				<section className="factions-panel factions-tab-content">
					<FactionActivity factionId={myFaction.id} />
				</section>
			)}

			{/* Tab: Galaxy */}
			{activeTab === 'galaxy' && (
				<section className="factions-panel factions-tab-content">
					{galaxyFactions.length === 0 ? (
						<p className="factions-browser-empty">No other factions in this galaxy yet.</p>
					) : (
						<div className="factions-browser-list">
							{galaxyFactions.map((f) => {
								const isExpanded = expandedFactionId === f.id;
								const cachedMembers = factionMemberCache[f.id];
								return (
									<div key={f.id} className="factions-browser-card">
										<div className="factions-browser-card-header">
											<div className="factions-browser-card-identity">
												<button
													type="button"
													className="factions-browser-card-name factions-browser-card-name-button"
													onClick={() => toggleFactionExpanded(f.id)}
													aria-expanded={isExpanded}
													aria-controls={`faction-members-${f.id}`}
												>
													{f.name}
												</button>
												<span className="factions-browser-card-tag">[{f.tag}]</span>
											</div>
											<span className="factions-browser-card-members">
												{f.memberCount} member{f.memberCount !== 1 ? 's' : ''}
											</span>
										</div>
										{f.description && <p className="factions-browser-card-desc">{f.description}</p>}
										{isExpanded && (
											<div
												className="factions-browser-card-members-panel"
												id={`faction-members-${f.id}`}
											>
												{cachedMembers === 'loading' && (
													<span className="factions-browser-card-members-status">
														Loading members…
													</span>
												)}
												{cachedMembers === 'error' && (
													<span className="factions-browser-card-members-status factions-field-error">
														Failed to load members.
													</span>
												)}
												{Array.isArray(cachedMembers) && cachedMembers.length === 0 && (
													<span className="factions-browser-card-members-status">
														This faction has no members.
													</span>
												)}
												{Array.isArray(cachedMembers) && cachedMembers.length > 0 && (
													<ul className="factions-browser-card-members-list">
														{cachedMembers.map((m) => (
															<li key={m.userId} className="factions-browser-card-members-item">
																<div className="factions-browser-card-member-main">
																	<Username
																		name={m.username}
																		isSupporter={m.isSupporter}
																		supporterTier={m.supporterTier as any}
																		linkToProfile
																	/>
																	<span
																		className={`factions-role-badge factions-role-badge--${m.role}`}
																	>
																		{m.role}
																	</span>
																</div>
																<div className="factions-browser-card-member-stats">
																	<span>{(m.points ?? 0).toLocaleString()} inf</span>
																	<span>
																		{m.nexusCount ?? 0} nexus{(m.nexusCount ?? 0) !== 1 ? 'es' : ''}
																	</span>
																</div>
															</li>
														))}
													</ul>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
					<p className="factions-treaty-hint" style={{ marginTop: 16 }}>
						Click a member to view their profile, add them as a friend, or check their galaxy
						history.
					</p>
				</section>
			)}

			{/* Tab: Wars */}
			{activeTab === 'wars' && (
				<section className="factions-panel factions-tab-content">
					{warError && <div className="factions-field-error factions-war-error">{warError}</div>}

					{wars.filter((w) => w.status === 'active').length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title factions-war-section-title--active">
								Active Wars
							</h3>
							{wars
								.filter((w) => w.status === 'active')
								.map((w) => {
									const enemy =
										w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
									return (
										<div key={w.id} className="factions-war-card factions-war-card--active">
											<div className="factions-war-info">
												<span className="factions-war-vs">WAR</span>
												<span className="factions-war-faction">
													[{enemy.tag}] {enemy.name}
												</span>
												{w.acceptedAt && (
													<span className="factions-war-meta">
														since{' '}
														{new Date(w.acceptedAt).toLocaleDateString([], {
															month: 'short',
															day: 'numeric'
														})}
													</span>
												)}
											</div>
											{canManage && (
												<button
													className="factions-btn-small"
													onClick={() => handleProposeCeasefire(w.id)}
												>
													Propose Ceasefire
												</button>
											)}
										</div>
									);
								})}
						</div>
					)}

					{wars.filter(
						(w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId !== myFaction.id
					).length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title factions-war-section-title--alert">
								Ceasefire Proposals
							</h3>
							{wars
								.filter(
									(w) =>
										w.status === 'ceasefire_pending' &&
										w.ceasefireProposerFactionId !== myFaction.id
								)
								.map((w) => {
									const enemy =
										w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
									return (
										<div
											key={w.id}
											className="factions-war-card factions-war-card--ceasefire-incoming"
										>
											<div className="factions-war-info">
												<span className="factions-war-faction">
													[{enemy.tag}] {enemy.name}
												</span>
												<span className="factions-war-meta">proposed a ceasefire</span>
											</div>
											{canManage && (
												<div className="factions-war-actions">
													<button
														className="factions-btn-primary"
														onClick={() => handleAcceptCeasefire(w.id)}
													>
														Accept
													</button>
													<button
														className="factions-btn-small factions-btn-danger"
														onClick={() => handleDeclineCeasefire(w.id)}
													>
														Decline
													</button>
												</div>
											)}
										</div>
									);
								})}
						</div>
					)}

					{wars.filter(
						(w) => w.status === 'ceasefire_pending' && w.ceasefireProposerFactionId === myFaction.id
					).length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title">Ceasefire Awaiting Response</h3>
							{wars
								.filter(
									(w) =>
										w.status === 'ceasefire_pending' &&
										w.ceasefireProposerFactionId === myFaction.id
								)
								.map((w) => {
									const enemy =
										w.declarerFactionId === myFaction.id ? w.targetFaction : w.declarerFaction;
									return (
										<div
											key={w.id}
											className="factions-war-card factions-war-card--ceasefire-outgoing"
										>
											<div className="factions-war-info">
												<span className="factions-war-faction">
													[{enemy.tag}] {enemy.name}
												</span>
												<span className="factions-war-meta">
													considering your ceasefire proposal
												</span>
											</div>
											<span className="factions-war-status-badge factions-war-status-badge--pending">
												Pending
											</span>
										</div>
									);
								})}
						</div>
					)}

					{wars.length === 0 && (
						<p className="factions-war-empty">No active wars or pending declarations.</p>
					)}

					{canManage && galaxyFactions.length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title">Declare War</h3>
							<form onSubmit={handleDeclareWar} className="factions-war-declare-form">
								<select
									value={selectedDeclareTarget}
									onChange={(e) => setSelectedDeclareTarget(e.target.value)}
									className="factions-war-select"
									disabled={warSubmitting}
								>
									<option value="">Select a faction...</option>
									{galaxyFactions
										.filter(
											(f) =>
												!wars.some(
													(w) =>
														w.status === 'active' &&
														((w.declarerFactionId === myFaction.id && w.targetFactionId === f.id) ||
															(w.targetFactionId === myFaction.id && w.declarerFactionId === f.id))
												)
										)
										.map((f) => (
											<option key={f.id} value={f.id}>
												[{f.tag}] {f.name}
											</option>
										))}
								</select>
								<button
									type="submit"
									className="factions-btn-danger"
									disabled={!selectedDeclareTarget || warSubmitting}
								>
									{warSubmitting ? 'Declaring...' : 'Declare War'}
								</button>
							</form>
						</div>
					)}
				</section>
			)}

			{/* Tab: Diplomacy */}
			{activeTab === 'diplomacy' && (
				<section className="factions-panel factions-tab-content">
					{treatyError && (
						<div className="factions-field-error factions-war-error">{treatyError}</div>
					)}

					{/* Pact Breaking - broken NAPs still inside their betrayal window */}
					{treaties.filter((t) => t.status === 'broken').length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title factions-war-section-title--alert">
								Pact Breaking
							</h3>
							{treaties
								.filter((t) => t.status === 'broken')
								.map((t) => {
									const other =
										t.proposerFactionId === myFaction.id
											? t.targetFaction
											: t.proposerFaction;
									// Determine which faction broke it: if the breaker is a member of
									// my faction, we are the aggressor; otherwise we are the victim.
									const isMyFactionBreaker =
										myFaction.members?.some((m) => m.userId === t.brokenByUserId) ??
										false;
									return (
										<div
											key={t.id}
											className={`factions-war-card ${isMyFactionBreaker ? 'factions-war-card--nap-broken-breaker' : 'factions-war-card--nap-broken'}`}
										>
											<div className="factions-war-info">
												<span
													className={`factions-war-vs ${isMyFactionBreaker ? 'factions-war-vs--amber' : 'factions-war-vs--broken'}`}
												>
													{isMyFactionBreaker ? 'PACT BROKEN' : 'BETRAYED'}
												</span>
												<span className="factions-war-faction">
													[{other?.tag}] {other?.name}
												</span>
												{t.betrayalEndsAt && (
													<NapBrokenCountdown
														betrayalEndsAt={t.betrayalEndsAt}
														isBreaker={isMyFactionBreaker}
													/>
												)}
											</div>
											<span className="factions-nap-broken-label">
												{isMyFactionBreaker
													? 'Strike window armed'
													: 'Recall exposed troops and fortify'}
											</span>
										</div>
									);
								})}
						</div>
					)}

					{treaties.filter((t) => t.status === 'pending' && t.targetFactionId === myFaction.id)
						.length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title factions-war-section-title--alert">
								Incoming Treaty Proposals
							</h3>
							{treaties
								.filter((t) => t.status === 'pending' && t.targetFactionId === myFaction.id)
								.map((t) => (
									<div key={t.id} className="factions-war-card factions-war-card--pending-incoming">
										<div className="factions-war-info">
											<span className="factions-war-faction">
												[{t.proposerFaction?.tag}] {t.proposerFaction?.name}
											</span>
											<span className="factions-war-meta">
												proposes a <strong>{TREATY_LABELS[t.type]}</strong>
												{t.durationDays ? ` (${t.durationDays} days)` : ''}
											</span>
										</div>
										{canManage && (
											<div className="factions-war-actions">
												<button
													className="factions-btn-small"
													onClick={() => handleAcceptTreaty(t.id)}
												>
													Accept
												</button>
												<button
													className="factions-btn-small factions-btn-danger"
													onClick={() => handleCancelTreaty(t.id)}
												>
													Decline
												</button>
											</div>
										)}
									</div>
								))}
						</div>
					)}

					{treaties.filter((t) => t.status === 'active').length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title factions-war-section-title--active">
								Active Agreements
							</h3>
							{treaties
								.filter((t) => t.status === 'active')
								.map((t) => {
									const other =
										t.proposerFactionId === myFaction.id ? t.targetFaction : t.proposerFaction;
									const isOpen = activeDiplomacyTreatyId === t.id;
									return (
										<div key={t.id} className="factions-war-card factions-war-card--active">
											<div className="factions-war-info">
												<span className="factions-treaty-type factions-treaty-type--active">
													{TREATY_LABELS[t.type]}
												</span>
												<span className="factions-war-faction">
													[{other?.tag}] {other?.name}
												</span>
												{t.expiresAt && (
													<span className="factions-war-meta">
														expires{' '}
														{new Date(t.expiresAt).toLocaleDateString([], {
															month: 'short',
															day: 'numeric',
															year: 'numeric'
														})}
													</span>
												)}
											</div>
											<div className="factions-war-actions">
												<button
													className={`factions-btn-small${isOpen ? ' factions-btn-active' : ''}`}
													onClick={() => setActiveDiplomacyTreatyId(isOpen ? null : t.id)}
												>
													{isOpen ? 'Close Chat' : 'Chat'}
												</button>
												{canManage && t.type === 'nap' && (
													<button
														className="factions-btn-small factions-btn-danger"
														onClick={() =>
															openBreakPactModal(
																t.id,
																`[${other?.tag}] ${other?.name}`
															)
														}
														disabled={breakNapSubmitting === t.id}
													>
														{breakNapSubmitting === t.id
															? 'Breaking...'
															: 'Break Pact'}
													</button>
												)}
												{canManage && t.type !== 'nap' && (
													<button
														className="factions-btn-small factions-btn-danger"
														onClick={() => handleCancelTreaty(t.id)}
													>
														Cancel
													</button>
												)}
											</div>
										</div>
									);
								})}
						</div>
					)}

					{activeDiplomacyTreatyId !== null &&
						(() => {
							const t = treaties.find(
								(x) => x.id === activeDiplomacyTreatyId && x.status === 'active'
							);
							if (!t) return null;
							const other =
								t.proposerFactionId === myFaction.id ? t.targetFaction : t.proposerFaction;
							return (
								<DiplomacyChat
									treatyId={t.id}
									currentUserId={currentUserId}
									partnerFactionName={other ? `[${other.tag}] ${other.name}` : 'Ally'}
									onClose={() => setActiveDiplomacyTreatyId(null)}
								/>
							);
						})()}

					{treaties.filter((t) => t.status === 'pending' && t.proposerFactionId === myFaction.id)
						.length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title">Pending Proposals</h3>
							{treaties
								.filter((t) => t.status === 'pending' && t.proposerFactionId === myFaction.id)
								.map((t) => (
									<div key={t.id} className="factions-war-card factions-war-card--pending-outgoing">
										<div className="factions-war-info">
											<span className="factions-treaty-type">{TREATY_LABELS[t.type]}</span>
											<span className="factions-war-faction">
												[{t.targetFaction?.tag}] {t.targetFaction?.name}
											</span>
											<span className="factions-war-meta">awaiting response</span>
										</div>
										<button
											className="factions-btn-small factions-btn-danger"
											onClick={() => handleCancelTreaty(t.id)}
										>
											Withdraw
										</button>
									</div>
								))}
						</div>
					)}

					{canManage && galaxyFactions.length > 0 && (
						<div className="factions-war-section">
							<h3 className="factions-war-section-title">Propose Treaty</h3>
							<form
								onSubmit={handleProposeTreaty}
								className="factions-war-declare-form factions-treaty-form"
							>
								<select
									value={treatyTarget}
									onChange={(e) => setTreatyTarget(e.target.value)}
									className="factions-war-select"
									disabled={treatySubmitting}
								>
									<option value="">Select faction...</option>
									{galaxyFactions.map((f) => (
										<option key={f.id} value={f.id}>
											[{f.tag}] {f.name}
										</option>
									))}
								</select>
								<select
									value={treatyType}
									onChange={(e) => setTreatyType(e.target.value as 'nap' | 'trade' | 'vassal')}
									className="factions-war-select"
									disabled={treatySubmitting}
								>
									<option value="nap">Non-Aggression Pact</option>
									<option value="trade">Trade Agreement</option>
									<option value="vassal">Vassal Treaty</option>
								</select>
								<input
									type="number"
									min={1}
									max={90}
									value={treatyDuration}
									onChange={(e) =>
										setTreatyDuration(Math.max(1, Math.min(90, parseInt(e.target.value) || 1)))
									}
									className="factions-treaty-duration-input"
									title="Duration in days"
									placeholder="Days"
									disabled={treatySubmitting}
								/>
								<button
									type="submit"
									className="factions-btn-small"
									disabled={!treatyTarget || treatySubmitting}
								>
									{treatySubmitting ? 'Sending...' : 'Propose'}
								</button>
							</form>
							<p className="factions-treaty-hint">
								NAP: no-attack agreement. Trade: shared market bonuses. Vassal: protective
								relationship (vassal agrees to support liege in wars).
							</p>
						</div>
					)}

					<div className="factions-war-section">
						<h3 className="factions-war-section-title">Galaxy Diplomacy Board</h3>
						{galaxyTreaties.length === 0 ? (
							<p className="factions-war-empty">No public agreements in this galaxy.</p>
						) : (
							<div className="factions-diplomacy-board">
								{[...galaxyTreaties]
										.sort(
											(a, b) =>
												Number(b.status === 'broken') - Number(a.status === 'broken')
										)
										.map((t) => (
									<div
										key={t.id}
										className={`factions-diplomacy-row${t.status === 'pending' ? ' factions-diplomacy-row--pending' : ''}${t.status === 'broken' ? ' factions-diplomacy-row--broken' : ''}`}
									>
										<span
											className={`factions-treaty-type factions-treaty-type--${t.status === 'active' ? 'active' : t.status === 'broken' ? 'broken' : 'pending'}`}
										>
											{t.status === 'broken' ? 'BROKEN NAP' : TREATY_LABELS[t.type]}
										</span>
										<span className="factions-diplomacy-parties">
											[{t.proposerFaction?.tag}] {t.proposerFaction?.name}
											<span className="factions-diplomacy-sep">
												{t.status === 'pending'
													? 'proposed to'
													: t.status === 'broken'
														? 'no longer at peace with'
														: 'and'}
											</span>
											[{t.targetFaction?.tag}] {t.targetFaction?.name}
										</span>
										<span
											className={`factions-diplomacy-status${t.status === 'broken' ? ' factions-diplomacy-status--broken' : ''}`}
										>
											{t.status === 'pending'
												? 'Pending'
												: t.status === 'broken'
													? 'Broken'
													: 'Active'}
										</span>
									</div>
								))}
							</div>
						)}
					</div>
				</section>
			)}

			{breakNapModal && (
				<BreakPactModal
					targetLabel={breakNapModal.targetLabel}
					submitting={breakNapSubmitting === breakNapModal.treatyId}
					error={breakNapError}
					onConfirm={() => handleBreakNap(breakNapModal.treatyId)}
					onClose={() => setBreakNapModal(null)}
				/>
			)}
		</div>
	);
}

const TREATY_LABELS: Record<string, string> = {
	nap: 'Non-Aggression Pact',
	trade: 'Trade Agreement',
	vassal: 'Vassal Treaty'
};
