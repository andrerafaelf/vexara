'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import '../styles/BreakPactModal.css';

// Hold-to-confirm window. The fill animation in BreakPactModal.css is tied to
// this same duration; if you change one, change the other.
const HOLD_MS = 800;

interface Props {
	// Full "[TAG] Faction Name" label of the pact partner being broken with.
	targetLabel: string;
	submitting: boolean;
	error: string | null;
	onConfirm: () => void;
	onClose: () => void;
}

// The break-pact confirm. Replaces a native window.confirm so the most dramatic
// act in diplomacy reads as a deliberate act of state, not an OS dialog. The
// hold-to-confirm gesture is the friction that lands the gravity without a
// second "are you sure". Server is authoritative; this only triggers breakNap.
export default function BreakPactModal({ targetLabel, submitting, error, onConfirm, onClose }: Props) {
	const [holding, setHolding] = useState(false);
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const clearHold = () => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		setHolding(false);
	};

	const startHold = () => {
		if (submitting) return;
		setHolding(true);
		timerRef.current = setTimeout(() => {
			timerRef.current = null;
			setHolding(false);
			onConfirm();
		}, HOLD_MS);
	};

	useEffect(() => {
		const lockClass = 'bpm-scroll-locked';
		document.body.classList.add(lockClass);
		document.body.style.overflow = 'hidden';
		const onKey = (e: KeyboardEvent) => {
			if (e.key === 'Escape' && !submitting) onClose();
		};
		window.addEventListener('keydown', onKey);
		return () => {
			document.body.classList.remove(lockClass);
			document.body.style.overflow = '';
			window.removeEventListener('keydown', onKey);
		};
	}, [onClose, submitting]);

	// Cancel any in-flight hold timer if the modal unmounts mid-press.
	useEffect(() => () => clearHold(), []);

	const holdLabel = submitting ? 'Breaking pact...' : holding ? 'Hold...' : 'Hold to break the pact';

	return createPortal(
		<div
			className="bpm-overlay"
			onMouseDown={(e) => {
				if (e.target === e.currentTarget && !submitting) onClose();
			}}
		>
			<div className="bpm-modal" role="dialog" aria-modal="true" aria-label="Break Non-Aggression Pact">
				<p className="bpm-eyebrow">ACT OF WAR</p>
				<h2 className="bpm-headline">Break the pact with {targetLabel}</h2>
				<p className="bpm-framing">
					Your word is the only thing holding the line between these factions. Breaking it starts
					the clock to war.
				</p>
				<ul className="bpm-ledger">
					<li>
						<span className="bpm-mark" aria-hidden="true" />A 60-minute warning window opens.
						Neither faction can land attacks until it closes.
					</li>
					<li>
						<span className="bpm-mark" aria-hidden="true" />
						{targetLabel} is alerted the instant you break. They will have time to prepare.
					</li>
					<li>
						<span className="bpm-mark" aria-hidden="true" />The break is posted to the galaxy
						diplomacy board for every faction to see.
					</li>
					<li>
						<span className="bpm-mark" aria-hidden="true" />You cannot sign a new pact with{' '}
						{targetLabel} for 24 hours.
					</li>
				</ul>
				{error && <p className="bpm-error">Could not break the pact. {error}</p>}
				<button
					type="button"
					className={`bpm-hold-btn${holding ? ' bpm-hold-btn--holding' : ''}`}
					onPointerDown={startHold}
					onPointerUp={clearHold}
					onPointerLeave={clearHold}
					onPointerCancel={clearHold}
					disabled={submitting}
				>
					<span className="bpm-hold-fill" aria-hidden="true" />
					<span className="bpm-hold-label">{holdLabel}</span>
				</button>
				<button type="button" className="bpm-secondary" onClick={onClose} disabled={submitting}>
					Keep the peace
				</button>
			</div>
		</div>,
		document.body
	);
}
