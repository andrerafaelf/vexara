'use client';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { getProfile, updateOnboardingStep } from '../services/api';

export interface OnboardingStep {
  id: string;
  // data-onboarding attribute value on the target element
  targetAttr: string;
  message: string;
  // Optional title shown above the message
  title?: string;
}

// Ordered list of beginner steps. Each targetAttr must match a
// data-onboarding="<value>" attribute somewhere in the DOM.
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    id: 'create_nexus',
    targetAttr: 'create-nexus',
    title: 'Create Your First Nexus',
    message: 'Your nexus is your base. Click here to place it on the galaxy map and begin your conquest.',
  },
  {
    id: 'upgrade_building',
    targetAttr: 'upgrade-building',
    title: 'Upgrade a Building',
    message: 'Upgrade your Command Core first — it unlocks every other building and increases your build queue.',
  },
  {
    id: 'train_troops',
    targetAttr: 'train-troops',
    title: 'Train Your First Troops',
    message: 'Troops defend your nexus and let you attack others. Queue a few Lancer Drones to get started.',
  },
  {
    id: 'send_attack',
    targetAttr: 'send-attack',
    title: 'Launch Your First Strike',
    message: 'Find a neutral nexus on the map and attack it to earn resources and score points.',
  },
  {
    id: 'join_faction',
    targetAttr: 'join-faction',
    title: 'Join a Faction',
    message: 'Factions unlock coordinated attacks, war rooms, and diplomacy. Find one to join here.',
  },
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
  disableTips: () => {},
});

export function OnboardingProvider({ children }: { children: React.ReactNode }) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);
  const [enabled, setEnabled]     = useState(false);
  const [ready, setReady]         = useState(false);

  useEffect(() => {
    // Load the user's current onboarding state from their profile.
    getProfile()
      .then((res: any) => {
        const user = res?.data;
        if (!user) return;
        if (!user.beginnerTipsEnabled) { setEnabled(false); setReady(true); return; }
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

  const currentStep = (ready && enabled && stepIndex !== null)
    ? (ONBOARDING_STEPS[stepIndex] ?? null)
    : null;

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
    <OnboardingContext.Provider value={{ currentStep, isEnabled: enabled, advance, dismiss, disableTips }}>
      {children}
    </OnboardingContext.Provider>
  );
}

export function useOnboarding() {
  return useContext(OnboardingContext);
}
