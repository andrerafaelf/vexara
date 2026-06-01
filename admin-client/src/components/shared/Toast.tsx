'use client';
import { CheckCircle, Info, X, XCircle } from 'lucide-react';
import React, { useEffect } from 'react';

export interface ToastMessage {
	id: string;
	message: string;
	type: 'success' | 'error' | 'info';
}

interface Props {
	toasts: ToastMessage[];
	onRemove: (id: string) => void;
}

export default function ToastStack({ toasts, onRemove }: Props) {
	return (
		<div
			style={{
				position: 'fixed',
				bottom: 24,
				right: 24,
				zIndex: 10000,
				display: 'flex',
				flexDirection: 'column',
				gap: 8,
				pointerEvents: 'none'
			}}
		>
			{toasts.map((t) => (
				<ToastItem key={t.id} toast={t} onRemove={onRemove} />
			))}
		</div>
	);
}

function ToastItem({ toast, onRemove }: { toast: ToastMessage; onRemove: (id: string) => void }) {
	useEffect(() => {
		const timer = setTimeout(() => onRemove(toast.id), 4200);
		return () => clearTimeout(timer);
	}, [toast.id, onRemove]);

	const Icon = toast.type === 'success' ? CheckCircle : toast.type === 'error' ? XCircle : Info;

	const style: React.CSSProperties = {
		display: 'flex',
		alignItems: 'center',
		gap: 10,
		padding: '11px 14px',
		borderRadius: 4,
		border: '1px solid',
		background: 'var(--color-navy-600)',
		boxShadow: 'var(--shadow-lg)',
		fontSize: 13,
		fontWeight: 500,
		color:
			toast.type === 'success'
				? 'var(--success)'
				: toast.type === 'error'
					? 'var(--danger)'
					: 'var(--adm-accent)',
		borderColor:
			toast.type === 'success'
				? 'rgba(86,211,100,0.35)'
				: toast.type === 'error'
					? 'rgba(248,81,73,0.35)'
					: 'var(--adm-accent-border)',
		maxWidth: 340,
		pointerEvents: 'all',
		animation: 'vx-slide .2s var(--ease-out)'
	};

	return (
		<div style={style}>
			<Icon size={15} style={{ flexShrink: 0 }} />
			<span style={{ flex: 1, color: 'var(--text-default)', lineHeight: 1.4 }}>
				{toast.message}
			</span>
			<button
				onClick={() => onRemove(toast.id)}
				style={{
					flexShrink: 0,
					color: 'var(--text-faint)',
					padding: 2,
					borderRadius: 2,
					lineHeight: 0
				}}
			>
				<X size={13} />
			</button>
		</div>
	);
}

let _toastId = 0;
export function mkToastId() {
	return String(++_toastId);
}
