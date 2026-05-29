'use client';

import { ArrowLeft } from 'lucide-react';
import type { MouseEventHandler } from 'react';
import '@/styles/InlineBackButton.css';

interface InlineBackButtonProps {
  /** Imperative back action . typically `() => setSelected(null)`. */
  onBack: MouseEventHandler<HTMLButtonElement>;
  /** Label shown beside the arrow. Defaults to "Back". */
  label?: string;
  /** Hide the label on narrow viewports (the arrow alone stays visible). */
  collapseOnMobile?: boolean;
  /** Extra class hook for layout-specific overrides. */
  className?: string;
}

// In-page back affordance for list . detail drill-downs that live inside a
// single route (Reports list . selected report, WarRoom board . selected op,
// FriendsView list . active chat). Shares the visual language of BackBar so
// the whole app uses one back affordance regardless of whether the back lives
// in the page chrome (BackBar) or inside a component's state (this).
//
// Deliberately stateless: the caller owns the "what does back mean here"
// decision (clearing a useState, switching tabs, navigating). This component
// just gives every drill-down the same look + interaction.

export default function InlineBackButton({
  onBack,
  label = 'Back',
  collapseOnMobile = false,
  className,
}: InlineBackButtonProps) {
  const cls = ['inline-back-btn', collapseOnMobile ? 'inline-back-btn--collapse' : null, className]
    .filter(Boolean)
    .join(' ');
  return (
    <button type="button" className={cls} onClick={onBack} aria-label={label}>
      <ArrowLeft size={14} aria-hidden="true" />
      <span className="inline-back-btn-label">{label}</span>
    </button>
  );
}
