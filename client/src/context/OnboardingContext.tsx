'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getProfile, updateOnboardingStep } from '../services/api';
import { useMyNexuses } from '../hooks/useMyNexuses';
import type { Nexus } from '../types/game';
import { usePathname } from 'next/navigation';

export interface OnboardingStep {
	id: string;
	// data-onboarding attribute value on the target element
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
	// surfacing before the player has built a Recruitment Core.
	isReady?: (state: OnboardingGameState) => boolean;
}

// Subset of game state the predicates can read. Kept narrow so the predicates
// stay cheap (no nested object access into possibly-undefined fields).
export interface OnboardingGameState {
	nexuses: Nexus[];
	pathname: string;
}

const isNexusPath = (pathname: string) => pathname === '/nexus' || pathname.startsWith('/nexus/');

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
			'Upgrade your Command Core first — it unlocks every other building and increases your build queue.',
		isReady: (s) => s.nexuses.length > 0 && isNexusPath(s.pathname),
		isComplete: (s) => s.nexuses.some((n) => (n.buildings?.commandCore ?? 1) >= 2)
	},
	{
		id: 'train_troops',
		targetAttr: 'train-troops',
		title: 'Train Your First Troops',
		message:
			'Troops defend your nexus and let you attack others. Queue a few Assault Troopers to get started.',
		// Only surface this once the player has a Recruitment Core. Without that
		// building the troop card is locked, so prompting the player to click it
		// just frustrates them.
		isReady: (s) =>
			isNexusPath(s.pathname) && s.nexuses.some((n) => (n.buildings?.recruitmentCore ?? 0) >= 1),
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
		isReady: (s) => s.nexuses.some((n) => (n.buildings?.recruitmentCore ?? 0) >= 1),
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
	// Call this after the user permanently turns off tips
	disableTips: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue>({
	currentStep: null,
	isEnabled: false,
	advance: () => {},
	dismiss: () => {},
	disableTips: () => {}
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
	// unimpeded until the gate opens (e.g. they build a Recruitment Core).
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

	return (
		<OnboardingContext.Provider
			value={{ currentStep, isEnabled: enabled, advance, dismiss, disableTips }}
		>
			{children}
		</OnboardingContext.Provider>
	);
}

export function useOnboarding() {
	return useContext(OnboardingContext);
}
