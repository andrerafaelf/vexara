'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getProfile, updateOnboardingStep } from '../services/api';
import { useMyNexuses } from '../hooks/useMyNexuses';
import type { Nexus } from '../types/game';
import { usePathname } from 'next/navigation';

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
		title: 'Create Your First Nexus',
		message:
			'Your nexus is your base. Click here to place it on the galaxy map and begin your conquest.',
		isComplete: (s) => s.nexuses.length > 0
	},
	{
		id: 'upgrade_building',
		targetAttr: 'upgrade-building',
		title: 'Upgrade a Building',
		message:
			'Upgrade your Command Core first - it unlocks your production buildings and expands your build queue.',
		isReady: (s) => s.nexuses.length > 0 && isNexusPath(s.pathname),
		isComplete: (s) => s.nexuses.some((n) => hasCommandCoreLevelStarted(n, 1))
	},
	{
		id: 'while_you_build',
		kind: 'panel',
		targetAttr: '',
		title: 'While Your Core Builds',
		message:
			'Your first upgrade is sped up, so this is quick. Two things to know while it finishes: the resource bar up top shows your Biomass, Alloy and Ore (and how fast they grow), and your build queue lines up upgrades to run back-to-back. When the Core lands it unlocks your production buildings.',
		// Only show this beat while the accelerated first build is actually
		// running. If the player already pushed past it (build done), isComplete
		// auto-advances so the panel never lingers on a stale state.
		isReady: (s) => isNexusPath(s.pathname) && s.nexuses.some((n) => isFirstBuildInProgress(n)),
		isComplete: (s) => s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 1)
	},
	{
		id: 'reinforce_command',
		targetAttr: 'upgrade-building',
		title: 'Reinforce Command',
		message:
			'Upgrade Command Core to Lv2 next - this opens the production buildings you need before training troops.',
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 1),
		isComplete: (s) => s.nexuses.some((n) => hasCommandCoreLevelStarted(n, 2))
	},
	{
		id: 'build_production',
		targetAttr: 'build-production',
		title: 'Build Troop Production',
		message: 'Build an Armor Foundry first - it unlocks Assault Troopers for your first raid.',
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.commandCore ?? 0) >= 2),
		isComplete: (s) => s.nexuses.some((n) => hasArmorFoundryStarted(n))
	},
	{
		id: 'counter_triangle',
		kind: 'panel',
		targetAttr: '',
		title: 'How Combat Works',
		message:
			'Every unit has a class, and classes counter each other: Mobile beats Armor, Armor beats Fire, Fire beats Mobile. Each unit is also a Striker (attack — send these out) or an Anvil (defense — keep these home). The badges on each unit show both. Bring the class that counters what your enemy fields, and scout first so you know what that is.',
		// Show this right before the player trains their first troops, once the
		// production building exists so the class/role badges are on screen to
		// look at. Completes when they actually start training (same signal as
		// train_troops) or dismiss it.
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.armorFoundry ?? 0) >= 1),
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
		title: 'Train Your First Troops',
		message:
			'Troops defend your nexus and let you attack others. Queue a few Assault Troopers to get started.',
		// Only surface this once Armor Foundry exists. The spotlight points at
		// Assault Troopers, and that card is locked until Armor Foundry Lv1.
		isReady: (s) =>
			isNexusPath(s.pathname) &&
			s.nexuses.some((n) => (n.buildings?.armorFoundry ?? 0) >= 1),
		isComplete: (s) =>
			s.nexuses.some((n) => {
				// Already has something in the training queue → done.
				if ((n.trainingQueue?.length ?? 0) > 0) return true;
				const trained = Number(n.troopsTrained?.assaultTrooper ?? 0);
				if (trained >= 5) return true;
				// Legacy fallback for snapshots without troopsTrained.
				const at = Number(n.troops?.assaultTrooper ?? 0);
				return at >= 5;
			})
	},
	{
		id: 'open_starfield',
		targetAttr: 'open-starfield',
		title: 'Open The Starfield',
		message: 'Head to the Starfield when your troops are ready, then pick a neutral nexus to raid.',
		isReady: (s) => s.nexuses.length > 0,
		isComplete: (s) => s.pathname === '/starfield'
	},
	{
		id: 'send_attack',
		targetAttr: 'send-attack',
		title: 'Launch Your First Strike',
		message: 'Find a neutral nexus on the map and attack it to earn resources and score points.',
		isReady: (s) => s.pathname === '/starfield'
		// No reliable client-side signal for "ever attacked"; only completes via
		// the explicit "Got it" or because the user navigates past it after the
		// target appears in the DOM.
	},
	{
		id: 'open_factions',
		targetAttr: 'open-factions',
		title: 'Open Factions',
		message: 'Open the Factions page to find allies and join a coordinated force.',
		isReady: (s) => s.nexuses.some((n) => hasClassProductionBuilding(n)),
		isComplete: (s) => s.pathname === '/factions'
	},
	{
		id: 'join_faction',
		targetAttr: 'join-faction',
		title: 'Join a Faction',
		message:
			'Factions unlock coordinated attacks, war rooms, and diplomacy. Find one to join here.',
		isReady: (s) => s.pathname === '/factions'
	}
];

interface OnboardingContextValue {
	currentStep: OnboardingStep | null;
	isEnabled: boolean;
	advance: () => void;
	dismiss: () => void;
	disableTips: () => void;
	reenableTips: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
	currentStep: null,
	isEnabled: false,
	advance: () => {},
	dismiss: () => {},
	disableTips: () => {},
	reenableTips: () => {}
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
	const [stepIndex, setStepIndex] = useState<number | null>(null);
	const [enabled, setEnabled] = useState(false);
	const [ready, setReady] = useState(false);
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
				if (!user.beginnerTipsEnabled) {
					setEnabled(false);
					setReady(true);
					return;
				}
				setEnabled(true);
				// onboardingStep stores the id of the LAST COMPLETED step.
				// We show the next one after it (or the first if null).
				if (!user.onboardingStep) {
					setStepIndex(0);
				} else {
					const lastIdx = ONBOARDING_STEPS.findIndex((s) => s.id === user.onboardingStep);
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

	return (
		<OnboardingContext.Provider
			value={{ currentStep, isEnabled: enabled, advance, dismiss, disableTips, reenableTips }}
		>
			{children}
		</OnboardingContext.Provider>
	);
}

export function useOnboarding() {
	return useContext(OnboardingContext);
}
