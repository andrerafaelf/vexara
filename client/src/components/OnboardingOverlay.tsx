'use client';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../styles/OnboardingOverlay.css';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import { useModalSlot } from '../context/ModalQueueContext';

interface SpotlightRect {
	top: number;
	left: number;
	width: number;
	height: number;
}

const PADDING = 10;

function getTargetRect(attr: string): DOMRect | null {
	const el = document.querySelector(`[data-onboarding="${attr}"]`);
	return el ? el.getBoundingClientRect() : null;
}

export default function OnboardingOverlay() {
	const { currentStep, advance, dismiss, disableTips } = useOnboarding();
	const [rect, setRect] = useState<SpotlightRect | null>(null);
	const [tooltipSide, setTooltipSide] = useState<'bottom' | 'top'>('bottom');
	const rafRef = useRef<number>(0);

	// Sit in the modal queue so the tutorial never lights up while PWA / WYWA
	// modals are still onscreen. We ask for the floor whenever the onboarding
	// context says there's a step to show; the queue releases the slot for the
	// next modal (patch notes) once tips are disabled or all steps are done.
	const canShow = useModalSlot('onboarding', currentStep !== null);

	useEffect(() => {
		if (!currentStep || !canShow) {
			setRect(null);
			return;
		}

		function update() {
			const domRect = getTargetRect(currentStep!.targetAttr);
			// Reject targets that are detached, zero-sized, or sitting completely
			// outside the viewport. Without this guard the spotlight latches onto
			// rects at (0,0) or below the fold and the tooltip pins itself to the
			// top-left of the page (the original "tooltip out of position" bug).
			const visible =
				domRect !== null &&
				domRect.width > 0 &&
				domRect.height > 0 &&
				domRect.bottom > 0 &&
				domRect.right > 0 &&
				domRect.top < window.innerHeight &&
				domRect.left < window.innerWidth;
			if (domRect && visible) {
				setRect({
					top: domRect.top - PADDING,
					left: domRect.left - PADDING,
					width: domRect.width + PADDING * 2,
					height: domRect.height + PADDING * 2
				});
				setTooltipSide(domRect.bottom + 160 > window.innerHeight ? 'top' : 'bottom');
			} else {
				setRect(null);
			}
			rafRef.current = requestAnimationFrame(update);
		}

		rafRef.current = requestAnimationFrame(update);
		return () => cancelAnimationFrame(rafRef.current);
	}, [currentStep, canShow]);

	if (!currentStep || !canShow || rect === null) return null;

	// Past this point the spotlight target is present in the DOM, so we render
	// a focused spotlight rather than a centered fallback bubble. The fallback
	// bubble was the source of "Upgrade a Building tip shows on the wrong
	// screen" — the tip would appear centered on whichever page the player was
	// on instead of waiting for the right one.

	return (
		<div className="ob-root" aria-live="polite">
			{/* Dim overlay with a transparent cutout where the target is */}
			<div className="ob-backdrop" onClick={dismiss} style={{ background: 'transparent' }}>
				<svg className="ob-mask" aria-hidden="true">
					<defs>
						<mask id="ob-spotlight-mask">
							<rect width="100%" height="100%" fill="white" />
							<rect
								x={rect.left}
								y={rect.top}
								width={rect.width}
								height={rect.height}
								rx={8}
								fill="black"
							/>
						</mask>
					</defs>
					<rect width="100%" height="100%" fill="rgba(0,0,0,0.72)" mask="url(#ob-spotlight-mask)" />
				</svg>
			</div>

			{/* Spotlight border ring */}
			<div
				className="ob-ring"
				style={{
					top: rect.top,
					left: rect.left,
					width: rect.width,
					height: rect.height
				}}
			/>

			{/* Tooltip bubble */}
			<div
				className={`ob-tooltip ob-tooltip--${tooltipSide}`}
				style={{
					position: 'fixed',
					left: Math.min(Math.max(rect.left + rect.width / 2 - 160, 16), window.innerWidth - 336),
					...(tooltipSide === 'bottom'
						? { top: rect.top + rect.height + 14 }
						: { bottom: window.innerHeight - rect.top + 14 })
				}}
			>
				<button className="ob-close" onClick={dismiss} aria-label="Dismiss tip">
					<X size={14} />
				</button>

				<div className="ob-step-label">
					Step {ONBOARDING_STEPS.findIndex((s) => s.id === currentStep.id) + 1} of{' '}
					{ONBOARDING_STEPS.length}
				</div>

				{currentStep.title && <div className="ob-title">{currentStep.title}</div>}
				<p className="ob-message">{currentStep.message}</p>

				<div className="ob-actions">
					<button className="ob-btn ob-btn--ghost" onClick={disableTips}>
						Disable tips
					</button>
					<button className="ob-btn ob-btn--primary" onClick={advance}>
						Got it
					</button>
				</div>
			</div>
		</div>
	);
}
