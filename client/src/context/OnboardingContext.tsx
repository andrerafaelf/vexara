'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getProfile, updateOnboardingStep } from '../services/api';
import { useMyNexuses } from '../hooks/useMyNexuses';
import type { Nexus } from '../types/game';
import { usePathname } from 'next/navigation';
import { getOnboardingTaperFraction, isOnboardingTrainEligible } from '../realtime/gameConstants.shared';

export interface OnboardingStep {
	id: string;
	// 'spotlight' (default) points at a DOM element via data-onboarding and dims
	// the rest of the page. 'panel' has no target — it renders a centered teaching
	// card, used for concept beats that aren't tied to a single button (e.g. the
	// "while you build" primer shown during the accelerated first upgrade).
	kind?: 'spotlight' | 'panel';
	// data-onboarding attribute value on the target element. Ignored for 'panel'
	// steps (they have no spotlight target), so those can pass an empty string.
	targetAttr: string;
	message: string;
	// Optional title shown above the message
	title?: string;
	// Predicate that returns true if the underlying objective is already
	// satisfied by current game state. When true, we skip the tooltip and
	// auto-record the step as complete on the server, even if the user never
	// saw it. This is what stops the "create_nexus" tooltip from popping up
	// after the user has already created a nexus, etc.
	isComplete?: (state: OnboardingGameState) => boolean;
	// Optional gate: when false, the step is suppressed (no tooltip, no auto-
	// complete) until the prerequisite is met. Stops e.g. "train troops" from
	// surfacing before the player has built a a class production building.
	isReady?: (state: OnboardingGameState) => boolean;
}

// Subset of game state the predicates can read. Kept narrow so the predicates
// stay cheap (no nested object access into possibly-undefined fields).
export interface OnboardingGameState {
	nexuses: Nexus[];
	pathname: string;
}

const isNexusPath = (pathname: string) => pathname === '/nexus' || pathname.startsWith('/nexus/');
const hasClassProductionBuilding = (nexus: Nexus) =>
	(nexus.buildings?.hangarBay ?? 0) >= 1 ||
	(nexus.buildings?.plasmaForge ?? 0) >= 1 ||
	(nexus.buildings?.armorFoundry ?? 0) >= 1;
const hasQueuedBuilding = (nexus: Nexus, building: string, targetLevel = 1) =>
	(nexus.buildQueue ?? []).some(
		(item) => item.building === building && Number(item.targetLevel) >= targetLevel
	);
const hasCommandCoreLevelStarted = (nexus: Nexus, level: number) =>
	(nexus.buildings?.commandCore ?? 0) >= level || hasQueuedBuilding(nexus, 'commandCore', level);
// The accelerated first build (Command Core 0 -> 1) is in flight: the upgrade is
// queued but hasn't completed yet. This is the window the "while you build"
// panel beat fills so the ~25s wait teaches instead of idling.
const isFirstBuildInProgress = (nexus: Nexus) =>
	(nexus.buildings?.commandCore ?? 0) < 1 && hasQueuedBuilding(nexus, 'commandCore', 1);
const hasArmorFoundryStarted = (nexus: Nexus) =>
	(nexus.buildings?.armorFoundry ?? 0) >= 1 || hasQueuedBuilding(nexus, 'armorFoundry');

// Ordered list of beginner steps. Each targetAttr must match a
// data-onboarding="<value>" attribute somewhere in the DOM.
export const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: 'create_nexus',
		targetAttr: 'create-nexus',
		title: 'Claim Your Nexus',
		message:
			'This is your base — it generates resources and trains your army. Tap here to place it on the galaxy map. Everything starts here.',
		isComplete: (s) => s.nexuses.length > 0
	},
	{
		id: 'upgrade_building',
		targetAttr: 'upgrade-building',
		title: 'Upgrade the Command Core',
		message:
			'This is your first move. Upgrading the Command Core to Lv1 unlocks everything else — production buildings, troops, the works. Tap Upgrade.',
		isReady: (s) => s.nexuses.length > 0 && isNexusPath(s.pathname),
		isComplete: (s) => s.nexuses.some((n) => hasCommandCoreLevelStarted(n, 1))
	},
	{
		id: 'while_you_build',
		kind: 'panel',
		targetAttr: '',
		title: 'While Your Command Core Upgrades',
		message:
			"It finishes in about 25 seconds. While it runs: the resource bar at the top shows your Biomass, Alloy, and Ore ticking up in real time. Resources accumulate even when you're not here — the game never stops.",
		isReady: (s) => isNexusPath(s.pathname) && s.nexuses.some((n) => isFirstBuildInProgress(n)),
		isComplete: (s) => s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 1)
	},
	{
		id: 'reinforce_command',
		targetAttr: 'upgrade-building',
		title: 'Push to Command Core Lv2',
		message:
			'One more upgrade unlocks your production buildings. Tap Upgrade — it queues instantly after the current build.',
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 1),
		isComplete: (s) => s.nexuses.some((n) => hasCommandCoreLevelStarted(n, 2))
	},
	{
		id: 'build_production',
		targetAttr: 'build-production',
		title: 'Build the Armor Foundry',
		message:
			'This unlocks Assault Troopers — your first raid unit. Tap Build. It completes in seconds.',
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 2),
		isComplete: (s) => s.nexuses.some((n) => hasArmorFoundryStarted(n))
	},
	{
		id: 'counter_triangle',
		kind: 'panel',
		targetAttr: '',
		title: 'Before You Train: How Combat Works',
		message:
			'Units have classes: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Each card shows a role — Strikers attack, Anvils defend. Send Strikers out, keep Anvils home. A mixed force beats a one-class army every time.',
		// Show as soon as the Armor Foundry is queued (not yet built) so the lesson
		// fills the short build wait rather than leaving the player idle.
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => hasArmorFoundryStarted(n)),
		isComplete: (s) =>
			s.nexuses.some((n) => {
				if ((n.trainingQueue?.length ?? 0) > 0) return true;
				const trained = Number(n.troopsTrained?.assaultTrooper ?? 0);
				return trained >= 5;
			})
	},
	{
		id: 'train_troops',
		targetAttr: 'train-troops',
		title: 'Train 5 Assault Troopers',
		message:
			'Queue 5 Assault Troopers — training is free during the tutorial and takes seconds. They raid neutrals, carry loot back, and defend your nexus.',
		isReady: (s) =>
			isNexusPath(s.pathname) &&
			s.nexuses.some((n) => (n.buildings?.armorFoundry ?? 0) >= 1),
		isComplete: (s) =>
			s.nexuses.some((n) => {
				if ((n.trainingQueue?.length ?? 0) > 0) return true;
				const trained = Number(n.troopsTrained?.assaultTrooper ?? 0);
				if (trained >= 5) return true;
				// Legacy fallback for snapshots without troopsTrained.
				const at = Number(n.troops?.assaultTrooper ?? 0);
				return at >= 5;
			})
	},
	{
		id: 'troops_training',
		kind: 'panel',
		targetAttr: '',
		title: 'Troops Ready in Seconds',
		message:
			'Your Assault Troopers are training now — they finish in about 25 seconds total. Once they land, the Starfield step unlocks automatically.',
		// Show while training is queued but no troops have finished yet.
		isReady: (s) =>
			isNexusPath(s.pathname) &&
			s.nexuses.some((n) => (n.trainingQueue?.length ?? 0) > 0 && (n.totalTroops ?? 0) === 0),
		isComplete: (s) => s.nexuses.some((n) => (n.totalTroops ?? 0) > 0)
	},
	{
		id: 'open_starfield',
		targetAttr: 'open-starfield',
		title: 'Head to the Starfield',
		message:
			'Your troops are ready. The Starfield is the galaxy map — every nexus you can see belongs to a real player or is a neutral target. Tap here.',
		// Gate on having actual troops so the player doesn't walk into the map empty-handed.
		isReady: (s) => s.nexuses.some((n) => (n.totalTroops ?? 0) > 0),
		isComplete: (s) => s.pathname === '/starfield'
	},
	{
		id: 'send_attack',
		targetAttr: 'send-attack',
		title: 'Attack a Neutral Nexus',
		message:
			'Grey nexuses are neutral — no owner, low risk. Tap one, then tap Attack. Loot comes home when your troops return. This is how you grow early.',
		isReady: (s) => s.pathname === '/starfield'
		// No reliable client-side signal for "ever attacked"; completes on "Got it"
		// or when the player navigates away after the target appears.
	},
	{
		id: 'open_factions',
		targetAttr: 'open-factions',
		title: 'Find a Faction',
		message:
			'Solo players get outgunned fast. Factions coordinate attacks, share intel, and fight for the season together. The faction that wins gets named in the Hall of Champions. Tap here.',
		isReady: (s) => s.nexuses.some((n) => hasClassProductionBuilding(n)),
		isComplete: (s) => s.pathname === '/factions'
	},
	{
		id: 'join_faction',
		targetAttr: 'join-faction',
		title: 'Apply to a Faction',
		message:
			'Find one with open slots and apply. Once you are in, you get shared chat, war room access, and allied troops that can station at your nexus. This is how the game opens up.',
		isReady: (s) => s.pathname === '/factions'
	},
	{
		id: 'tutorial_complete',
		kind: 'panel',
		targetAttr: '',
		title: "You're Set",
		message:
			"That's the core loop: build your economy, train troops, raid for resources, win the season with your faction. The galaxy is live right now — other players are already moving. Daily quests in the sidebar give you a goal each session. Good luck, commander.",
		isReady: (s) => s.pathname === '/factions',
		// No isComplete — this is the final beat, player dismisses it manually.
	}
];

interface OnboardingContextValue {
	currentStep: OnboardingStep | null;
	isEnabled: boolean;
	// True while the player is eligible for the free Assault Trooper training
	// discount (beginnerTipsEnabled and hasn't yet completed train_troops).
	isTroopDiscountActive: boolean;
	// 1 = full discount, 0 = none. Decays linearly by account age once
	// isTroopDiscountActive is true, so a returning player who paused
	// mid-tutorial doesn't see a cost/time cliff. Mirrors the server taper in
	// getOnboardingTaperFraction — keep both in sync.
	onboardingTaperFraction: number;
	// The id of the last completed onboarding step (null = none yet). Exposed
	// so call sites can compute onboarding build-time discounts client-side.
	lastCompletedStep: string | null;
	advance: () => void;
	dismiss: () => void;
	disableTips: () => void;
	reenableTips: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
	currentStep: null,
	isEnabled: false,
	isTroopDiscountActive: false,
	onboardingTaperFraction: 0,
	lastCompletedStep: null,
	advance: () => {},
	dismiss: () => {},
	disableTips: () => {},
	reenableTips: () => {}
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
	const [stepIndex, setStepIndex] = useState<number | null>(null);
	const [enabled, setEnabled] = useState(false);
	const [ready, setReady] = useState(false);
	// The id of the last completed onboarding step, as stored on the server.
	// Null means the player hasn't completed any step yet.
	const [lastCompletedStep, setLastCompletedStep] = useState<string | null>(null);
	const [createdAt, setCreatedAt] = useState<string | null>(null);
	const { nexuses } = useMyNexuses();
	const pathname = usePathname();
	// Track which step ids we've already auto-completed in this session so we
	// don't spam updateOnboardingStep on every render.
	const autoSentRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		// Load the user's current onboarding state from their profile.
		getProfile()
			.then((res: any) => {
				const user = res?.data;
				if (!user) return;
				setCreatedAt(user.createdAt ?? null);
				if (!user.beginnerTipsEnabled) {
					setEnabled(false);
					setReady(true);
					return;
				}
				setEnabled(true);
				// onboardingStep stores the id of the LAST COMPLETED step.
				// We show the next one after it (or the first if null).
				const completedId: string | null = user.onboardingStep ?? null;
				setLastCompletedStep(completedId);
				if (!completedId) {
					setStepIndex(0);
				} else {
					const lastIdx = ONBOARDING_STEPS.findIndex((s) => s.id === completedId);
					const next = lastIdx + 1;
					setStepIndex(next < ONBOARDING_STEPS.length ? next : null);
				}
				setReady(true);
			})
			.catch(() => setReady(true));
	}, []);

	// Auto-advance past any step the player has already accomplished via normal
	// play. Fixes the race where, for example, the player creates a nexus before
	// the create-nexus tooltip has finished loading — without this, the next
	// page mount would surface a stale "create your first nexus" centered
	// fallback bubble, or worse, attribute the user's next click ("Got it") to
	// the wrong step.
	useEffect(() => {
		if (!ready || !enabled || stepIndex === null) return;
		const step = ONBOARDING_STEPS[stepIndex];
		if (!step) return;
		const state: OnboardingGameState = { nexuses, pathname };
		if (step.isComplete?.(state)) {
			if (!autoSentRef.current.has(step.id)) {
				autoSentRef.current.add(step.id);
				void updateOnboardingStep(step.id).catch(() => {});
				setLastCompletedStep(step.id);
			}
			const next = stepIndex + 1;
			setStepIndex(next < ONBOARDING_STEPS.length ? next : null);
		}
	}, [ready, enabled, stepIndex, nexuses, pathname]);

	const rawStep =
		ready && enabled && stepIndex !== null ? (ONBOARDING_STEPS[stepIndex] ?? null) : null;
	// Suppress steps whose prerequisites haven't been met. Returning null from
	// currentStep tears down the overlay entirely, so the player can play
	// unimpeded until the gate opens (e.g. they build a a class production building).
	const gateOpen =
		rawStep === null || rawStep.isReady === undefined || rawStep.isReady({ nexuses, pathname });
	const currentStep = gateOpen ? rawStep : null;

	const advance = useCallback(() => {
		if (stepIndex === null) return;
		const completedStep = ONBOARDING_STEPS[stepIndex];
		if (completedStep) {
			void updateOnboardingStep(completedStep.id).catch(() => {});
			setLastCompletedStep(completedStep.id);
		}
		const next = stepIndex + 1;
		setStepIndex(next < ONBOARDING_STEPS.length ? next : null);
	}, [stepIndex]);

	const dismiss = useCallback(() => {
		// Dismiss without marking complete — will show same step next session.
		setStepIndex(null);
	}, []);

	const disableTips = useCallback(() => {
		setEnabled(false);
		setStepIndex(null);
		void updateOnboardingStep('__disabled__').catch(() => {});
	}, []);

	const reenableTips = useCallback(() => {
		void updateOnboardingStep('__enabled__').catch(() => {});
		setEnabled(true);
		setStepIndex(0);
	}, []);

	const isTroopDiscountActive = isOnboardingTrainEligible(
		'assaultTrooper',
		enabled,
		lastCompletedStep
	);
	const onboardingTaperFraction = isTroopDiscountActive ? getOnboardingTaperFraction(createdAt) : 0;

	return (
		<OnboardingContext.Provider
			value={{
				currentStep,
				isEnabled: enabled,
				isTroopDiscountActive,
				onboardingTaperFraction,
				lastCompletedStep,
				advance,
				dismiss,
				disableTips,
				reenableTips
			}}
		>
			{children}
		</OnboardingContext.Provider>
	);
}

export function useOnboarding() {
	return useContext(OnboardingContext);
}
