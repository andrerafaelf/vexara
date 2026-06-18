'use client';

import { useEffect, useState } from 'react';
import { deleteQueueTemplate, getQueueTemplates, saveQueueTemplate } from '../services/api';
import { useToast } from '../context/ToastContext';

interface QueueTemplate {
	id: number;
	name: string;
	troopType: string;
	amount: number;
}

// Module-level cache shared across every TrainAmountControls instance on the
// page, so opening the picker for a second troop type doesn't re-fetch.
let cache: QueueTemplate[] | null = null;
let cachePromise: Promise<QueueTemplate[]> | null = null;
const listeners = new Set<() => void>();

function loadTemplates(): Promise<QueueTemplate[]> {
	if (cache) return Promise.resolve(cache);
	if (!cachePromise) {
		cachePromise = getQueueTemplates()
			.then((r) => {
				const templates: QueueTemplate[] = r.data.templates ?? [];
				cache = templates;
				return templates;
			})
			.finally(() => {
				cachePromise = null;
			});
	}
	return cachePromise;
}

function setCache(templates: QueueTemplate[]) {
	cache = templates;
	listeners.forEach((fn) => fn());
}

interface Props {
	troopType: string;
	currentAmount: string;
	onApply: (amount: number) => void;
}

export default function QueueTemplatesBar({ troopType, currentAmount, onApply }: Props) {
	const toast = useToast();
	const [templates, setTemplates] = useState<QueueTemplate[]>(cache ?? []);
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		const listener = () => setTemplates(cache ?? []);
		listeners.add(listener);
		loadTemplates().then(setTemplates);
		return () => {
			listeners.delete(listener);
		};
	}, []);

	const forThisTroop = templates.filter((t) => t.troopType === troopType);

	const handleSave = async () => {
		const amount = parseInt(currentAmount, 10);
		if (!amount || amount < 1) {
			toast('Enter an amount first', 'error');
			return;
		}
		const name = window.prompt('Name this template:', `${amount}x`);
		if (!name) return;
		setSaving(true);
		try {
			const res = await saveQueueTemplate(name, troopType, amount);
			setCache([...(cache ?? []), res.data.template]);
			toast('Template saved', 'success');
		} catch (err: any) {
			toast(err?.response?.data?.error || err?.message || 'Failed to save template', 'error');
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (id: number, e: React.MouseEvent) => {
		e.stopPropagation();
		try {
			await deleteQueueTemplate(id);
			setCache((cache ?? []).filter((t) => t.id !== id));
		} catch (err: any) {
			toast(err?.response?.data?.error || 'Failed to remove template', 'error');
		}
	};

	return (
		<div className="qtb-bar">
			<button type="button" className="qtb-save" onClick={handleSave} disabled={saving}>
				Save as template
			</button>
			{forThisTroop.length > 0 && (
				<div className="qtb-dropdown">
					<button type="button" className="qtb-toggle" onClick={() => setOpen((o) => !o)}>
						Templates ({forThisTroop.length})
					</button>
					{open && (
						<div className="qtb-menu">
							{forThisTroop.map((t) => (
								<div
									key={t.id}
									className="qtb-menu-item"
									onClick={() => {
										onApply(t.amount);
										setOpen(false);
									}}
								>
									<span>
										{t.name} — {t.amount}x
									</span>
									<button
										type="button"
										className="qtb-menu-delete"
										onClick={(e) => handleDelete(t.id, e)}
										aria-label={`Remove ${t.name}`}
									>
										×
									</button>
								</div>
							))}
						</div>
					)}
				</div>
			)}
		</div>
	);
}
