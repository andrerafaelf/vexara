'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
	CheckCircle2,
	ChevronRight,
	Clock,
	Gift,
	Shield,
	Sparkles,
	Tag,
	UserPen,
	X
} from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import { getShop, shopEquipBorder, shopGiftPass, shopPurchase, shopRename } from '../services/api';
import '../styles/Shop.css';

type Tab = 'titles' | 'borders' | 'rename' | 'gift';

interface ShopItem {
	key: string;
	type: string;
	name: string;
	description: string;
	vpCost: number;
	cssClass?: string;
	isPremiumTier?: boolean;
}

interface ShopData {
	titles: ShopItem[];
	borders: ShopItem[];
	utilities: ShopItem[];
	refreshesAt: string;
	vexPoints: number;
	equippedBorder: string | null;
	ownedKeys: string[];
	renameCooldownDays: number | null;
}

interface Props {
	onClose: () => void;
}

function msUntilRefresh(refreshesAt: string): string {
	const ms = new Date(refreshesAt).getTime() - Date.now();
	if (ms <= 0) return '0h 0m';
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return `${h}h ${m}m`;
}

function TierBadge({ vpCost }: { vpCost: number }) {
	const tier = vpCost >= 400 ? 'rare' : vpCost >= 250 ? 'uncommon' : 'common';
	return <span className={`shop-tier shop-tier--${tier}`}>{tier}</span>;
}

function BorderPreview({ cssClass, name }: { cssClass: string; name: string }) {
	return (
		<div className="shop-border-preview-wrap" aria-label={`${name} border preview`}>
			<div
				className={`shop-border-preview-frame border-${cssClass}`}
				style={{ width: 72, height: 72 }}
			>
				<div className="shop-border-preview-avatar" />
			</div>
		</div>
	);
}

export default function ShopModal({ onClose }: Props) {
	const { user, updateUser } = useAuth();
	const queryClient = useQueryClient();
	const [tab, setTab] = React.useState<Tab>('titles');
	const [error, setError] = React.useState<string | null>(null);
	const [success, setSuccess] = React.useState<string | null>(null);
	const [giftUsername, setGiftUsername] = React.useState('');
	const [renameValue, setRenameValue] = React.useState('');
	const [busyKey, setBusyKey] = React.useState<string | null>(null);
	const [pendingConfirmKey, setPendingConfirmKey] = React.useState<string | null>(null);
	const [confirmingRename, setConfirmingRename] = React.useState(false);
	const [confirmingGift, setConfirmingGift] = React.useState(false);

	React.useEffect(() => {
		const prev = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		return () => {
			document.body.style.overflow = prev;
		};
	}, []);

	const { data: shopRaw, isLoading } = useQuery({
		queryKey: ['shop'],
		queryFn: () => getShop().then((r) => r.data as ShopData),
		staleTime: 60_000
	});

	const shop = shopRaw ?? null;
	const vp = shop?.vexPoints ?? user?.vexPoints ?? 0;

	function flash(msg: string, isError = false) {
		setError(isError ? msg : null);
		setSuccess(isError ? null : msg);
		setTimeout(() => {
			setError(null);
			setSuccess(null);
		}, 3500);
	}

	function handleBuyClick(key: string) {
		if (pendingConfirmKey === key) {
			setPendingConfirmKey(null);
			buyMutation.mutate(key);
		} else {
			setPendingConfirmKey(key);
		}
	}

	// ── Buy title or border ────────────────────────────────────────────────────
	const buyMutation = useMutation({
		mutationFn: (itemKey: string) => shopPurchase(itemKey).then((r) => r.data),
		onMutate: (itemKey) => setBusyKey(itemKey),
		onSettled: () => setBusyKey(null),
		onSuccess: (_data, itemKey) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			flash('Purchased! Check your titles / borders.');
			// Optimistically add title to earnedTitles if it's a title item
			const item = [...(shop?.titles ?? [])].find((i) => i.key === itemKey);
			if (item && item.type === 'title' && user) {
				const existing = user.earnedTitles ?? [];
				if (!existing.includes(item.name)) {
					updateUser({
						earnedTitles: [...existing, item.name],
						vexPoints: (user.vexPoints ?? 0) - item.vpCost
					});
				}
			}
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Purchase failed', true)
	});

	// ── Equip border ──────────────────────────────────────────────────────────
	const equipMutation = useMutation({
		mutationFn: (borderKey: string | null) => shopEquipBorder(borderKey).then((r) => r.data),
		onMutate: (key) => setBusyKey(key ?? '__unequip__'),
		onSettled: () => setBusyKey(null),
		onSuccess: (_data, borderKey) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ avatarBorder: borderKey });
			flash(borderKey ? 'Border equipped.' : 'Border removed.');
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Failed to equip', true)
	});

	// ── Rename ────────────────────────────────────────────────────────────────
	const renameMutation = useMutation({
		mutationFn: () => shopRename(renameValue.trim()).then((r) => r.data),
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ username: data.username, vexPoints: (user?.vexPoints ?? 0) - 500 });
			setRenameValue('');
			flash(`Username changed to "${data.username}".`);
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Rename failed', true)
	});

	// ── Gift pass ─────────────────────────────────────────────────────────────
	const giftMutation = useMutation({
		mutationFn: () => shopGiftPass(giftUsername.trim()).then((r) => r.data),
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ vexPoints: (user?.vexPoints ?? 0) - 1000 });
			setGiftUsername('');
			flash(`Pass gifted to ${data.recipientUsername}.`);
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Gift failed', true)
	});

	if (typeof document === 'undefined') return null;

	return createPortal(
		<div className="shop-backdrop" onClick={onClose}>
			<div
				className="shop-modal"
				role="dialog"
				aria-label="Vex Shop"
				onClick={(e) => e.stopPropagation()}
			>
				{/* ── Header ── */}
				<div className="shop-header">
					<div className="shop-header-left">
						<Sparkles size={15} className="shop-header-icon" aria-hidden="true" />
						<div>
							<div className="shop-title">Vex Shop</div>
							<div className="shop-subtitle">Rotates daily · Cosmetic only</div>
						</div>
					</div>
					<div className="shop-header-right">
						<span className="shop-vp-balance">
							<Sparkles size={11} aria-hidden="true" />
							{vp.toLocaleString()} VP
						</span>
						{shop && (
							<span className="shop-refresh-countdown">
								<Clock size={10} aria-hidden="true" />
								{msUntilRefresh(shop.refreshesAt)}
							</span>
						)}
						<button className="shop-close" onClick={onClose} aria-label="Close shop">
							<X size={17} />
						</button>
					</div>
				</div>

				{/* ── Tabs ── */}
				<div className="shop-tabs" role="tablist">
					{(
						[
							['titles', <Tag size={13} key="t" />, 'Titles'],
							['borders', <Shield size={13} key="b" />, 'Borders'],
							['rename', <UserPen size={13} key="r" />, 'Rename'],
							['gift', <Gift size={13} key="g" />, 'Gift Pass']
						] as [Tab, React.ReactNode, string][]
					).map(([id, icon, label]) => (
						<button
							key={id}
							role="tab"
							aria-selected={tab === id}
							className={`shop-tab${tab === id ? ' shop-tab--active' : ''}`}
							onClick={() => {
								setTab(id);
								setError(null);
								setSuccess(null);
							}}
						>
							{icon}
							{label}
						</button>
					))}
				</div>

				{/* ── Flash messages ── */}
				{(error || success) && (
					<div className={`shop-flash${error ? ' shop-flash--error' : ' shop-flash--ok'}`}>
						{error ?? success}
					</div>
				)}

				{/* ── Content ── */}
				<div className="shop-body">
					{isLoading && <div className="shop-loading">Loading shop…</div>}

					{/* TITLES */}
					{!isLoading && tab === 'titles' && shop && (
						<div className="shop-section">
							<p className="shop-section-hint">
								3 titles rotate daily. They are added permanently to your title collection.
							</p>
							<div className="shop-items">
								{shop.titles.map((item) => {
									const owned = shop.ownedKeys.includes(item.key);
									const canAfford = vp >= item.vpCost;
									const busy = busyKey === item.key;
									return (
										<div key={item.key} className={`shop-item${owned ? ' shop-item--owned' : ''}`}>
											<div className="shop-item-header">
												<TierBadge vpCost={item.vpCost} />
												{owned && <CheckCircle2 size={13} className="shop-item-owned-icon" />}
											</div>
											<div className="shop-item-name">{item.name}</div>
											<div className="shop-item-desc">{item.description}</div>
											<div className="shop-item-footer">
												<span className="shop-item-cost">
													<Sparkles size={10} aria-hidden="true" />
													{item.vpCost.toLocaleString()} VP
												</span>
												{owned ? (
													<span className="shop-item-owned-label">Owned</span>
												) : (
													<button
														className="shop-buy-btn"
														disabled={!canAfford || busy}
														onClick={() => handleBuyClick(item.key)}
													>
														{busy ? (
															'…'
														) : pendingConfirmKey === item.key ? (
															`Confirm (${item.vpCost.toLocaleString()} VP)`
														) : canAfford ? (
															<>
																Buy <ChevronRight size={11} />
															</>
														) : (
															'Need VP'
														)}
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>
						</div>
					)}

					{/* BORDERS */}
					{!isLoading && tab === 'borders' && shop && (
						<div className="shop-section">
							<p className="shop-section-hint">
								3 borders rotate daily. Equip them from your collection after purchase.
							</p>
							<div className="shop-items shop-items--border">
								{shop.borders.map((item) => {
									const owned = shop.ownedKeys.includes(item.key);
									const equipped = shop.equippedBorder === item.key;
									const canAfford = vp >= item.vpCost;
									const busy = busyKey === item.key;
									const equipBusy = busyKey === item.key + '_equip';
									return (
										<div
											key={item.key}
											className={`shop-item shop-item--border${owned ? ' shop-item--owned' : ''}${item.isPremiumTier ? ' shop-item--premium' : ''}`}
										>
											<BorderPreview cssClass={item.cssClass ?? ''} name={item.name} />
											<div className="shop-item-header">
												{item.isPremiumTier && (
													<span className="shop-tier shop-tier--premium">Commander</span>
												)}
												{!item.isPremiumTier && (
													<span
														className={`shop-tier shop-tier--${item.vpCost >= 900 ? 'rare' : item.vpCost >= 500 ? 'uncommon' : 'common'}`}
													>
														{item.vpCost >= 900
															? 'rare'
															: item.vpCost >= 500
																? 'uncommon'
																: 'common'}
													</span>
												)}
												{equipped && <CheckCircle2 size={13} className="shop-item-owned-icon" />}
											</div>
											<div className="shop-item-name">{item.name}</div>
											<div className="shop-item-desc">{item.description}</div>
											<div className="shop-item-footer">
												<span className="shop-item-cost">
													<Sparkles size={10} aria-hidden="true" />
													{item.vpCost.toLocaleString()} VP
												</span>
												{!owned && (
													<button
														className="shop-buy-btn"
														disabled={!canAfford || busy}
														onClick={() => handleBuyClick(item.key)}
													>
														{busy ? (
															'…'
														) : pendingConfirmKey === item.key ? (
															`Confirm (${item.vpCost.toLocaleString()} VP)`
														) : canAfford ? (
															<>
																Buy <ChevronRight size={11} />
															</>
														) : (
															'Need VP'
														)}
													</button>
												)}
												{owned && !equipped && (
													<button
														className="shop-buy-btn shop-buy-btn--equip"
														disabled={!!equipBusy}
														onClick={() => equipMutation.mutate(item.key)}
													>
														{equipBusy ? '…' : 'Equip'}
													</button>
												)}
												{owned && equipped && (
													<button
														className="shop-buy-btn shop-buy-btn--unequip"
														onClick={() => equipMutation.mutate(null)}
													>
														Remove
													</button>
												)}
											</div>
										</div>
									);
								})}
							</div>

							{/* Owned borders not in today's rotation */}
							{shop.ownedKeys.filter(
								(k) => k.startsWith('border_') && !shop.borders.some((b) => b.key === k)
							).length > 0 && (
								<div className="shop-owned-borders">
									<div className="shop-owned-borders-title">Your borders</div>
									<div className="shop-items shop-items--border">
										{shop.ownedKeys
											.filter((k) => k.startsWith('border_'))
											.map((key) => {
												const ALL_BORDERS_IMPORT: Record<
													string,
													{ cssClass?: string; name: string; vpCost: number }
												> = {};
												const equipped = shop.equippedBorder === key;
												const cssClass = key.replace('border_', '').replace(/_/g, '-');
												return (
													<div
														key={key}
														className={`shop-item shop-item--border shop-item--owned${equipped ? ' shop-item--equipped' : ''}`}
													>
														<BorderPreview cssClass={cssClass} name={key} />
														<div className="shop-item-name">
															{key.replace('border_', '').replace(/_/g, ' ')}
														</div>
														<div className="shop-item-footer">
															{!equipped ? (
																<button
																	className="shop-buy-btn shop-buy-btn--equip"
																	onClick={() => equipMutation.mutate(key)}
																	disabled={busyKey === key}
																>
																	{busyKey === key ? '…' : 'Equip'}
																</button>
															) : (
																<button
																	className="shop-buy-btn shop-buy-btn--unequip"
																	onClick={() => equipMutation.mutate(null)}
																>
																	Remove
																</button>
															)}
														</div>
													</div>
												);
											})}
									</div>
								</div>
							)}
						</div>
					)}

					{/* RENAME */}
					{tab === 'rename' && (
						<div className="shop-section shop-section--utility">
							<div className="shop-utility-card">
								<div className="shop-utility-icon">
									<UserPen size={22} />
								</div>
								<div className="shop-utility-name">Commander Rename</div>
								<div className="shop-utility-desc">
									Change your username. Only letters, numbers, and underscores. 30-day cooldown
									after use.
								</div>
								<div className="shop-utility-cost">
									<Sparkles size={11} aria-hidden="true" />
									500 VP
								</div>
								{shop?.renameCooldownDays != null && (
									<div className="shop-cooldown">
										<Clock size={11} aria-hidden="true" />
										Available in {shop.renameCooldownDays} day
										{shop.renameCooldownDays !== 1 ? 's' : ''}
									</div>
								)}
								{shop?.renameCooldownDays == null && (
									<form
										className="shop-rename-form"
										onSubmit={(e) => {
											e.preventDefault();
											if (!confirmingRename) {
												setConfirmingRename(true);
											} else {
												setConfirmingRename(false);
												renameMutation.mutate();
											}
										}}
									>
										<input
											className="shop-rename-input"
											type="text"
											placeholder="new username"
											value={renameValue}
											onChange={(e) => {
												setRenameValue(e.target.value);
												setConfirmingRename(false);
											}}
											minLength={3}
											maxLength={20}
											pattern="[a-zA-Z0-9_]+"
											disabled={renameMutation.isPending || confirmingRename}
											required
										/>
										<button
											type="submit"
											className={`shop-buy-btn${confirmingRename ? ' shop-buy-btn--confirm' : ''}`}
											disabled={renameMutation.isPending || !renameValue.trim() || vp < 500}
										>
											{renameMutation.isPending
												? '…'
												: confirmingRename
													? 'Are you sure? (500 VP)'
													: vp >= 500
														? 'Rename — 500 VP'
														: 'Need VP'}
										</button>
										{confirmingRename && (
											<button
												type="button"
												className="shop-cancel-btn"
												onClick={() => setConfirmingRename(false)}
											>
												Cancel
											</button>
										)}
									</form>
								)}
							</div>
						</div>
					)}

					{/* GIFT PASS */}
					{tab === 'gift' && (
						<div className="shop-section shop-section--utility">
							<div className="shop-utility-card">
								<div className="shop-utility-icon">
									<Gift size={22} />
								</div>
								<div className="shop-utility-name">Gift Vex Protocol Pass</div>
								<div className="shop-utility-desc">
									Unlock the battle pass premium track for a galaxy mate. They must be in your
									active galaxy and not already have the pass.
								</div>
								<div className="shop-utility-cost">
									<Sparkles size={11} aria-hidden="true" />
									1,000 VP
								</div>
								<form
									className="shop-rename-form"
									onSubmit={(e) => {
										e.preventDefault();
										if (!confirmingGift) {
											setConfirmingGift(true);
										} else {
											setConfirmingGift(false);
											giftMutation.mutate();
										}
									}}
								>
									<input
										className="shop-rename-input"
										type="text"
										placeholder="commander username"
										value={giftUsername}
										onChange={(e) => {
											setGiftUsername(e.target.value);
											setConfirmingGift(false);
										}}
										disabled={giftMutation.isPending || confirmingGift}
										required
									/>
									<button
										type="submit"
										className={`shop-buy-btn${confirmingGift ? ' shop-buy-btn--confirm' : ''}`}
										disabled={giftMutation.isPending || !giftUsername.trim() || vp < 1000}
									>
										{giftMutation.isPending
											? '…'
											: confirmingGift
												? `Gift to ${giftUsername}? (1,000 VP)`
												: vp >= 1000
													? 'Gift — 1,000 VP'
													: 'Need VP'}
									</button>
									{confirmingGift && (
										<button
											type="button"
											className="shop-cancel-btn"
											onClick={() => setConfirmingGift(false)}
										>
											Cancel
										</button>
									)}
								</form>
							</div>
						</div>
					)}
				</div>
			</div>
		</div>,
		document.body
	);
}
