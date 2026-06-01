'use client';
import { AlertTriangle, Trash2 } from 'lucide-react';
import React, { useEffect, useRef } from 'react';

export interface ConfirmModalProps {
	title: string;
	description: string;
	/** If provided, user must type this exact string to unlock the confirm button */
	typeToConfirm?: string;
	confirmLabel?: string;
	variant?: 'danger' | 'warning';
	onConfirm: () => void;
	onCancel: () => void;
}

export default function ConfirmModal({
	title,
	description,
	typeToConfirm,
	confirmLabel = 'Confirm',
	variant = 'danger',
	onConfirm,
	onCancel
}: ConfirmModalProps) {
	const [typed, setTyped] = React.useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const unlocked = typeToConfirm ? typed === typeToConfirm : true;

	// focus the input or the confirm button on open
	useEffect(() => {
		if (typeToConfirm) {
			inputRef.current?.focus();
		}
	}, [typeToConfirm]);

	// close on Escape
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onCancel();
		};
		window.addEventListener('keydown', handler);
		return () => window.removeEventListener('keydown', handler);
	}, [onCancel]);

	const color = variant === 'warning' ? 'var(--warning)' : 'var(--danger)';
	const softBg = variant === 'warning' ? 'rgba(210,153,34,0.10)' : 'rgba(248,81,73,0.10)';
	const border = variant === 'warning' ? 'rgba(210,153,34,0.35)' : 'rgba(248,81,73,0.35)';
	const Icon = variant === 'warning' ? AlertTriangle : Trash2;

	return (
		<div
			className="cm-overlay"
			onClick={onCancel}
			role="dialog"
			aria-modal="true"
			aria-labelledby="cm-title"
		>
			<div className="cm-box" onClick={(e) => e.stopPropagation()} style={{ borderColor: border }}>
				<div className="cm-icon-wrap" style={{ background: softBg, color }}>
					<Icon size={20} aria-hidden="true" />
				</div>
				<h3 id="cm-title" className="cm-title">
					{title}
				</h3>
				<p className="cm-desc">{description}</p>

				{typeToConfirm && (
					<div className="cm-type-wrap">
						<p className="cm-type-hint">
							Type <strong>{typeToConfirm}</strong> to confirm
						</p>
						<input
							ref={inputRef}
							className="cm-type-input"
							type="text"
							value={typed}
							onChange={(e) => setTyped(e.target.value)}
							onKeyDown={(e) => {
								if (e.key === 'Enter' && unlocked) onConfirm();
							}}
							placeholder={typeToConfirm}
							autoComplete="off"
							spellCheck={false}
						/>
					</div>
				)}

				<div className="cm-footer">
					<button className="cm-btn-cancel" onClick={onCancel}>
						Cancel
					</button>
					<button
						className="cm-btn-confirm"
						style={{
							background: unlocked ? color : 'transparent',
							borderColor: border,
							color: unlocked ? '#fff' : color,
							opacity: unlocked ? 1 : 0.45
						}}
						disabled={!unlocked}
						onClick={onConfirm}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</div>
	);
}
