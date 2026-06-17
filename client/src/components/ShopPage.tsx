'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import React from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../context/AuthContext';
import {
	getShop,
	shopEquipBorder,
	shopGiftPass,
	shopPurchase,
	shopPurchaseBundle,
	shopRename
} from '../services/api';
import '../styles/Shop.css';
import Avatar from './Avatar';

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

interface BorderCollection {
	collectionKey: string;
	collectionName: string;
	borders: ShopItem[];
}

interface ShopData {
	titles: ShopItem[];
	borderCollection: BorderCollection;
	utilities: ShopItem[];
	refreshesAt: string;
	vexPoints: number;
	equippedBorder: string | null;
	ownedKeys: string[];
	renameCooldownDays: number | null;
}

function msUntilRefresh(refreshesAt: string): string {
	const ms = new Date(refreshesAt).getTime() - Date.now();
	if (ms <= 0) return '0h 0m';
	const h = Math.floor(ms / 3_600_000);
	const m = Math.floor((ms % 3_600_000) / 60_000);
	return `${h}h ${m}m`;
}

function BorderPreview({
	borderKey,
	name,
	username,
	avatarUrl,
	avatarUrlSm
}: {
	borderKey: string;
	name: string;
	username: string;
	avatarUrl?: string | null;
	avatarUrlSm?: string | null;
}) {
	const borderCssClass = borderKey.replace('border_', '').replace(/_/g, '-');
	return (
		<div className="shop-border-preview-wrap" aria-label={`${name} border preview`}>
			<div className={`shop-border-preview-frame border-${borderCssClass}`}>
				<div className="shop-border-preview-avatar">
					<Avatar
						username={username}
						avatarUrl={avatarUrl}
						avatarUrlSm={avatarUrlSm}
						className="shop-border-preview-img"
						ariaHidden
					/>
				</div>
			</div>
		</div>
	);
}

export default function ShopPage() {
	const { user, updateUser } = useAuth();
	const queryClient = useQueryClient();
	const [tab, setTab] = React.useState<Tab>('titles');
	const [error, setError] = React.useState<string | null>(null);
	const [success, setSuccess] = React.useState<string | null>(null);
	const [giftUsername, setGiftUsername] = React.useState('');
	const [renameValue, setRenameValue] = React.useState('');
	const [busyKey, setBusyKey] = React.useState<string | null>(null);
	const [confirmModal, setConfirmModal] = React.useState<{
		key: string;
		label: string;
		description: string;
		cost: number;
		isBundle?: boolean;
	} | null>(null);
	const [confirmingRename, setConfirmingRename] = React.useState(false);
	const [confirmingGift, setConfirmingGift] = React.useState(false);

	const { data: shopRaw, isLoading } = useQuery({
		queryKey: ['shop'],
		queryFn: () => getShop().then((r) => r.data as ShopData),
		staleTime: 60_000
	});

	const shop = shopRaw ?? null;
	const vp = shop?.vexPoints ?? 0;

	React.useEffect(() => {
		const requestedTab = new URLSearchParams(window.location.search).get('tab');
		if (requestedTab && ['titles', 'borders', 'rename', 'gift'].includes(requestedTab)) {
			setTab(requestedTab as Tab);
		}
	}, []);

	function flash(msg: string, isError = false) {
		setError(isError ? msg : null);
		setSuccess(isError ? null : msg);
		setTimeout(() => {
			setError(null);
			setSuccess(null);
		}, 3500);
	}

	function handleBuyClick(key: string, label: string, cost: number, description: string) {
		setConfirmModal({ key, label, description, cost });
	}

	function handleBundleClick(collectionKey: string, collectionName: string) {
		setConfirmModal({
			key: collectionKey,
			label: `${collectionName} Collection Bundle`,
			description: `All 6 frames from the ${collectionName} series. Already-owned frames are credited.`,
			cost: 300,
			isBundle: true
		});
	}

	function handleConfirmPurchase() {
		if (!confirmModal) return;
		if (confirmModal.isBundle) {
			bundleMutation.mutate(confirmModal.key);
		} else {
			buyMutation.mutate(confirmModal.key);
		}
		setConfirmModal(null);
	}

	function selectTab(nextTab: Tab) {
		setTab(nextTab);
		setError(null);
		setSuccess(null);
		const url = new URL(window.location.href);
		if (nextTab === 'titles') url.searchParams.delete('tab');
		else url.searchParams.set('tab', nextTab);
		window.history.replaceState(null, '', url);
	}

	const buyMutation = useMutation({
		mutationFn: (itemKey: string) => shopPurchase(itemKey).then((r) => r.data),
		onMutate: (itemKey) => setBusyKey(itemKey),
		onSettled: () => setBusyKey(null),
		onSuccess: (_data, itemKey) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			flash('Requisition approved. The item is now in your records.');
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

	const bundleMutation = useMutation({
		mutationFn: (collectionKey: string) => shopPurchaseBundle(collectionKey).then((r) => r.data),
		onMutate: (key) => setBusyKey(`bundle_${key}`),
		onSettled: () => setBusyKey(null),
		onSuccess: (_data, collectionKey) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			flash(
				`${collectionKey.charAt(0).toUpperCase() + collectionKey.slice(1)} collection acquired.`
			);
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Purchase failed', true)
	});

	const equipMutation = useMutation({
		mutationFn: (borderKey: string | null) => shopEquipBorder(borderKey).then((r) => r.data),
		onMutate: (key) => setBusyKey(key ?? '__unequip__'),
		onSettled: () => setBusyKey(null),
		onSuccess: (_data, borderKey) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ avatarBorder: borderKey });
			flash(borderKey ? 'Portrait frame equipped.' : 'Portrait frame removed.');
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Failed to equip', true)
	});

	const renameMutation = useMutation({
		mutationFn: () => shopRename(renameValue.trim()).then((r) => r.data),
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ username: data.username, vexPoints: (user?.vexPoints ?? 0) - 500 });
			setRenameValue('');
			flash(`Command record updated to "${data.username}".`);
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Rename failed', true)
	});

	const giftMutation = useMutation({
		mutationFn: () => shopGiftPass(giftUsername.trim()).then((r) => r.data),
		onSuccess: (data: any) => {
			queryClient.invalidateQueries({ queryKey: ['shop'] });
			queryClient.invalidateQueries({ queryKey: ['user'] });
			updateUser({ vexPoints: (user?.vexPoints ?? 0) - 1000 });
			setGiftUsername('');
			flash(`Campaign issue sent to ${data.recipientUsername}.`);
		},
		onError: (err: any) => flash(err?.response?.data?.error ?? 'Gift failed', true)
	});

	return (
		<>
		<div className="shop-page">
			{/* ── Page header ── */}
			<div className="shop-page-header">
				<div className="shop-page-header-left">
					<div>
						<p className="shop-page-kicker">Faction supply office</p>
						<h1 className="shop-page-title">Quartermaster</h1>
						<p className="shop-page-subtitle">
							Personal effects and command records. No battlefield advantage.
						</p>
					</div>
				</div>
				<div className="shop-page-header-right">
					<span className="shop-vp-balance">
						<span>Available credit</span>
						<strong>{vp.toLocaleString()} VP</strong>
					</span>
					{shop && (
						<span className="shop-refresh-countdown">
							Stock changes in {msUntilRefresh(shop.refreshesAt)}
						</span>
					)}
				</div>
			</div>

			{/* ── Tabs ── */}
			<div className="shop-tabs" role="tablist">
				{(
					[
						['titles', 'Service titles'],
						['borders', 'Portrait frames'],
						['rename', 'Identity record'],
						['gift', 'Issue campaign pass']
					] as [Tab, string][]
				).map(([id, label]) => (
					<button
						key={id}
						role="tab"
						aria-selected={tab === id}
						className={`shop-tab${tab === id ? ' shop-tab--active' : ''}`}
						onClick={() => selectTab(id)}
					>
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
				{isLoading && <div className="shop-loading">Checking quartermaster stock...</div>}

				{/* TITLES */}
				{!isLoading && tab === 'titles' && shop && (
					<div className="shop-section">
						<div className="shop-section-intro">
							<div className="shop-section-label">Current issue</div>
							<p className="shop-section-hint">
								Three service titles are posted each day. Once issued, a title remains on your
								permanent record.
							</p>
						</div>
						<div className="shop-items">
							{shop.titles.map((item) => {
								const owned = shop.ownedKeys.includes(item.key);
								const canAfford = vp >= item.vpCost;
								const busy = busyKey === item.key;
								return (
									<div key={item.key} className={`shop-item${owned ? ' shop-item--owned' : ''}`}>
										<div className="shop-item-header">
											<span className="shop-stock-number">
												TITLE / {String(shop.titles.indexOf(item) + 1).padStart(2, '0')}
											</span>
											{owned && <span className="shop-status-stamp">Issued</span>}
										</div>
										<div className="shop-item-name">{item.name}</div>
										<div className="shop-item-desc">{item.description}</div>
										<div className="shop-item-footer">
											<span className="shop-item-cost">{item.vpCost.toLocaleString()} VP</span>
											{owned ? (
												<span className="shop-item-owned-label">On record</span>
											) : (
												<button
													className="shop-buy-btn"
													disabled={!canAfford || busy}
													onClick={() => handleBuyClick(item.key, item.name, item.vpCost, item.description)}
												>
													{busy ? 'Working...' : canAfford ? 'Requisition' : 'Insufficient VP'}
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
				{!isLoading &&
					tab === 'borders' &&
					shop &&
					(() => {
						const { collectionKey, collectionName, borders } = shop.borderCollection;
						const ownedBorderKeys = new Set(shop.ownedKeys.filter((k) => k.startsWith('border_')));
						const collectionOwned = borders.filter((b) => ownedBorderKeys.has(b.key));
						const allCollectionOwned = collectionOwned.length === borders.length;
						const bundleBusy = busyKey === `bundle_${collectionKey}`;
						return (
							<div className="shop-section">
								{/* Today's collection */}
								<div className="shop-section-intro">
									<div className="shop-section-label">Today's collection — {collectionName}</div>
									<p className="shop-section-hint">
										Six frames from the {collectionName} series. Buy individually for 75 VP each, or
										grab the full set for 300 VP.
									</p>
								</div>

								<div className="shop-border-collection">
									<div className="shop-items shop-items--border">
										{borders.map((item, idx) => {
											const owned = ownedBorderKeys.has(item.key);
											const equipped = shop.equippedBorder === item.key;
											const canAfford = vp >= item.vpCost;
											const busy = busyKey === item.key;
											return (
												<div
													key={item.key}
													className={`shop-item shop-item--border${owned ? ' shop-item--owned' : ''}${equipped ? ' shop-item--equipped' : ''}`}
												>
													<div className="shop-item-header">
														<span className="shop-stock-number">
															{collectionName.toUpperCase()} / {String(idx + 1).padStart(2, '0')}
														</span>
														{owned && (
															<span className="shop-status-stamp">
																{equipped ? 'Fitted' : 'Owned'}
															</span>
														)}
													</div>
													<BorderPreview
														borderKey={item.key}
														name={item.name}
														username={user?.username ?? 'V'}
														avatarUrl={user?.avatarUrl}
														avatarUrlSm={user?.avatarUrlSm}
													/>
													<div className="shop-item-name">{item.name}</div>
													<div className="shop-item-footer">
														{owned ? (
															equipped ? (
																<button
																	className="shop-buy-btn shop-buy-btn--unequip"
																	onClick={() => equipMutation.mutate(null)}
																	disabled={busyKey === '__unequip__'}
																>
																	Remove
																</button>
															) : (
																<button
																	className="shop-buy-btn shop-buy-btn--equip"
																	onClick={() => equipMutation.mutate(item.key)}
																	disabled={busy}
																>
																	{busy ? '…' : 'Equip'}
																</button>
															)
														) : (
															<>
																<span className="shop-item-cost">{item.vpCost} VP</span>
																<button
																	className="shop-buy-btn"
																	disabled={!canAfford || busy}
																	onClick={() => handleBuyClick(item.key, item.name, item.vpCost, item.description)}
																>
																	{busy
																		? 'Working...'
																		: canAfford
																			? 'Requisition'
																			: 'Insufficient VP'}
																</button>
															</>
														)}
													</div>
												</div>
											);
										})}
									</div>

									{/* Bundle CTA */}
									{!allCollectionOwned && (
										<div className="shop-bundle-bar">
											<div className="shop-bundle-bar-text">
												<span className="shop-bundle-name">{collectionName} Collection Bundle</span>
												<span className="shop-bundle-desc">
													All 6 frames · 300 VP
													{collectionOwned.length > 0 && ` · You own ${collectionOwned.length}/6`}
												</span>
											</div>
											<button
												className="shop-buy-btn shop-buy-btn--bundle"
												disabled={vp < 300 || bundleBusy}
												onClick={() => handleBundleClick(collectionKey, collectionName)}
											>
												{bundleBusy
													? 'Working...'
													: vp >= 300
														? 'Buy bundle (300 VP)'
														: 'Insufficient VP'}
											</button>
										</div>
									)}
								</div>
							</div>
						);
					})()}

				{/* RENAME */}
				{tab === 'rename' && (
					<div className="shop-section shop-section--utility">
						<div className="shop-utility-card">
							<div className="shop-utility-kicker">Personnel form 17-B</div>
							<div className="shop-utility-name">Amend identity record</div>
							<div className="shop-utility-desc">
								Change the commander name attached to your account. Letters, numbers, and
								underscores only. Records can be amended once every 30 days.
							</div>
							<div className="shop-utility-cost">Processing fee: 500 VP</div>
							{shop?.renameCooldownDays != null && (
								<div className="shop-cooldown">
									Record locked for {shop.renameCooldownDays} more day
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
										placeholder="New commander name"
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
											? 'Filing...'
											: confirmingRename
												? 'Confirm — 500 VP?'
												: vp >= 500
													? 'Update record (500 VP)'
													: 'Insufficient VP'}
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
							<div className="shop-utility-kicker">Campaign issue desk</div>
							<div className="shop-utility-name">Issue a command campaign pass</div>
							<div className="shop-utility-desc">
								Authorize Command Pass rewards for another commander in your active galaxy.
								Existing pass holders cannot receive a second issue.
							</div>
							<div className="shop-utility-cost">Issue cost: 1,000 VP</div>
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
									placeholder="Commander name"
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
										? 'Issuing...'
										: confirmingGift
											? `Gift to ${giftUsername}? (1,000 VP)`
											: vp >= 1000
												? 'Issue pass (1,000 VP)'
												: 'Insufficient VP'}
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

		{/* Purchase confirm modal */}
		{confirmModal &&
			typeof document !== 'undefined' &&
			createPortal(
				<div className="shop-confirm-backdrop" onClick={() => setConfirmModal(null)}>
					<div
						className="shop-confirm-modal"
						role="dialog"
						aria-modal="true"
						onClick={(e) => e.stopPropagation()}
					>
						<div className="shop-confirm-header">
							<span className="shop-confirm-title">Confirm requisition</span>
							<button className="shop-confirm-close" onClick={() => setConfirmModal(null)} aria-label="Cancel">
								<X size={14} />
							</button>
						</div>
						<p className="shop-confirm-item">{confirmModal.label}</p>
						{confirmModal.description && (
							<p className="shop-confirm-desc">{confirmModal.description}</p>
						)}
						<div className="shop-confirm-ledger">
							<div className="shop-confirm-ledger-row">
								<span>Current balance</span>
								<span>{vp.toLocaleString()} VP</span>
							</div>
							<div className="shop-confirm-ledger-row shop-confirm-ledger-row--deduct">
								<span>Cost</span>
								<span>− {confirmModal.cost.toLocaleString()} VP</span>
							</div>
							<div className="shop-confirm-ledger-divider" />
							<div className={`shop-confirm-ledger-row shop-confirm-ledger-row--remaining${vp - confirmModal.cost < 0 ? ' shop-confirm-ledger-row--insufficient' : ''}`}>
								<span>Remaining</span>
								<span>{(vp - confirmModal.cost).toLocaleString()} VP</span>
							</div>
						</div>
						<div className="shop-confirm-actions">
							<button className="shop-cancel-btn" onClick={() => setConfirmModal(null)}>Cancel</button>
							<button
								className="shop-buy-btn shop-buy-btn--confirm"
								onClick={handleConfirmPurchase}
								disabled={vp < confirmModal.cost}
							>
								Confirm — {confirmModal.cost.toLocaleString()} VP
							</button>
						</div>
					</div>
				</div>,
				document.body
			)}
		</>
	);
}
