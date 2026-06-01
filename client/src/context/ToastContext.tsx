'use client';

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Toast from '../components/Toast';

interface ToastItem {
	id: number;
	message: string;
	type: 'success' | 'error' | 'info';
}

interface ToastContextType {
	toast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

let nextId = 0;

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		setMounted(true);
	}, []);

	const toast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
		const id = ++nextId;
		setToasts((prev) => [...prev, { id, message, type }]);
	}, []);

	const dismiss = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const stack = (
		<div className="toast-stack" aria-live="polite" aria-atomic="false">
			{toasts.map((t) => (
				<Toast key={t.id} message={t.message} type={t.type} onClose={() => dismiss(t.id)} />
			))}
		</div>
	);

	return (
		<ToastContext.Provider value={{ toast }}>
			{children}
			{mounted && createPortal(stack, document.body)}
		</ToastContext.Provider>
	);
};

export const useToast = () => {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error('useToast must be used within ToastProvider');
	return ctx.toast;
};
