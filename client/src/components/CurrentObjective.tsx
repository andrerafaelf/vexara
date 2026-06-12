'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ArrowRight } from 'lucide-react';
import { useOnboarding } from '../context/OnboardingContext';

// Maps an onboarding step id to where the player should go to act on it. Steps
// that live on the nexus dashboard route to /nexus (the active tab is driven by
// the onboarding context's own effect once there); map/faction steps route to
// their pages. Keys mirror ONBOARDING_STEPS ids.
const STEP_DESTINATION: Record<string, { href: string; label: string }> = {
	create_nexus: { href: '/play', label: 'Get started' },
	upgrade_building: { href: '/nexus', label: 'Buildings' },
	while_you_build: { href: '/nexus', label: 'Buildings' },
	reinforce_command: { href: '/nexus', label: 'Buildings' },
	build_production: { href: '/nexus', label: 'Buildings' },
	counter_triangle: { href: '/nexus', label: 'Troops' },
	train_troops: { href: '/nexus', label: 'Troops' },
	open_starfield: { href: '/starfield', label: 'Starfield' },
	send_attack: { href: '/starfield', label: 'Starfield' },
	open_factions: { href: '/factions', label: 'Factions' },
	join_faction: { href: '/factions', label: 'Factions' }
};

/**
 * Compact "current objective" card for the right rail (beta). Surfaces the
 * player's single next onboarding step — the same signal the old header NEXT
 * chip showed — so the rail reads as a "what do I do next" hub above Daily
 * Quests. Reuses the onboarding context's gated currentStep, so it stays in
 * lockstep with the guided flow and disappears once tips are done/disabled.
 */
export default function CurrentObjective() {
	const router = useRouter();
	const { currentStep } = useOnboarding();

	if (!currentStep) return null;

	const dest = STEP_DESTINATION[currentStep.id] ?? { href: '/nexus', label: 'Open' };

	return (
		<button
			type="button"
			className="objective-card"
			onClick={() => router.push(dest.href)}
			aria-label={`Current objective: ${currentStep.title ?? 'Next step'}`}
		>
			<div className="objective-card-head">
				<Sparkles size={12} aria-hidden="true" />
				<span className="objective-card-kicker">Next objective</span>
			</div>
			{currentStep.title && <p className="objective-card-title">{currentStep.title}</p>}
			<p className="objective-card-message">{currentStep.message}</p>
			<span className="objective-card-cta">
				{dest.label}
				<ArrowRight size={13} aria-hidden="true" />
			</span>
		</button>
	);
}
