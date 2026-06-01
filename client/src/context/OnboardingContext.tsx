'use client';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { getProfile, updateOnboardingStep } from '../services/api';
import { useMyNexuses } from '../hooks/useMyNexuses';
import type { Nexus } from '../types/game';

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
}

// Subset of game state the predicates can read. Kept narrow so the predicates
// stay cheap (no nested object access into possibly-undefined fields).
export interface OnboardingGameState {
	nexuses: Nexus[];
}

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
		isComplete: (s) => s.nexuses.some((n) => (n.buildings?.commandCore ?? 1) >= 2)
	},
	{
		id: 'train_troops',
		targetAttr: 'train-troops',
		title: 'Train Your First Troops',
		message:
			'Troops defend your nexus and let you attack others. Queue a few Lancer Drones to get started.',
		isComplete: (s) =>
			s.nexuses.some((n) => {
				const t = n.troops;
				if (!t) return false;
				// Any non-starter troop count or anything in the training queue counts.
				const trained = Object.values(t).reduce<number>((a, b) => a + (Number(b) || 0), 0);
				const queued = (n.trainingQueue?.length ?? 0) > 0;
				return trained > 50 || queued;
			})
	},
	{
		id: 'send_attack',
		targetAttr: 'send-attack',
		title: 'Launch Your First Strike',
		message: 'Find a neutral nexus on the map and attack it to earn resources and score points.'
		// No reliable client-side signal for "ever attacked"; only completes via
		// the explicit "Got it" or because the user navigates past it after the
		// target appears in the DOM.
	},
	{
		id: 'join_faction',
		targetAttr: 'join-faction',
		title: 'Join a Faction',
		message: 'Factions unlock coordinated attacks, war rooms, and diplomacy. Find one to join here.'
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
		const state: OnboardingGameState = { nexuses };
		if (step.isComplete?.(state)) {
			if (!autoSentRef.current.has(step.id)) {
				autoSentRef.current.add(step.id);
				void updateOnboardingStep(step.id).catch(() => {});
			}
			const next = stepIndex + 1;
			setStepIndex(next < ONBOARDING_STEPS.length ? next : null);
		}
	}, [ready, enabled, stepIndex, nexuses]);

	const currentStep =
		ready && enabled && stepIndex !== null ? (ONBOARDING_STEPS[stepIndex] ?? null) : null;

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
