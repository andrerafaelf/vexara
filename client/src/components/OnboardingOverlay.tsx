'use client';
import { X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import '../styles/OnboardingOverlay.css';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';

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

	useEffect(() => {
		if (!currentStep) {
			setRect(null);
			return;
		}

		function update() {
			const domRect = getTargetRect(currentStep!.targetAttr);
			if (domRect) {
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
	}, [currentStep]);

	if (!currentStep) return null;

	// If the target element is not in the DOM yet, show a centred fallback.
	const hasTarget = rect !== null;

	return (
		<div className="ob-root" aria-live="polite">
			{/* Dim overlay with a transparent cutout where the target is */}
			<div
				className="ob-backdrop"
				onClick={dismiss}
				style={
					hasTarget
						? {
								// Four pseudo-shadow rects via box-shadow to leave the spotlight clear.
								// We use an SVG clip via inline style instead so it works on all browsers.
								background: 'transparent'
							}
						: undefined
				}
			>
				{hasTarget && (
					<svg className="ob-mask" aria-hidden="true">
						<defs>
							<mask id="ob-spotlight-mask">
								<rect width="100%" height="100%" fill="white" />
								<rect
									x={rect!.left}
									y={rect!.top}
									width={rect!.width}
									height={rect!.height}
									rx={8}
									fill="black"
								/>
							</mask>
						</defs>
						<rect
							width="100%"
							height="100%"
							fill="rgba(0,0,0,0.72)"
							mask="url(#ob-spotlight-mask)"
						/>
					</svg>
				)}
				{!hasTarget && <div className="ob-full-dim" />}
			</div>

			{/* Spotlight border ring */}
			{hasTarget && (
				<div
					className="ob-ring"
					style={{
						top: rect!.top,
						left: rect!.left,
						width: rect!.width,
						height: rect!.height
					}}
				/>
			)}

			{/* Tooltip bubble */}
			<div
				className={`ob-tooltip ob-tooltip--${tooltipSide}`}
				style={
					hasTarget
						? {
								position: 'fixed',
								left: Math.min(
									Math.max(rect!.left + rect!.width / 2 - 160, 16),
									window.innerWidth - 336
								),
								...(tooltipSide === 'bottom'
									? { top: rect!.top + rect!.height + 14 }
									: { bottom: window.innerHeight - rect!.top + 14 })
							}
						: {
								position: 'fixed',
								top: '50%',
								left: '50%',
								transform: 'translate(-50%, -50%)'
							}
				}
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
