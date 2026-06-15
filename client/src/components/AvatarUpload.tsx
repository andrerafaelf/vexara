'use client';

import { Pencil, X, Upload } from 'lucide-react';
import React, { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CDN_BASE } from '../data/gameIcons';
import { setAvatarPreset, setActiveTitle, shopEquipBorder, uploadAvatar } from '../services/api';
import Avatar from './Avatar';

const TROOP_KEYS = [
	'assaultTrooper',
	'sentinelLancer',
	'vanguardBreaker',
	'reconOperative',
	'wraithSkimmer',
	'bulwarkGuard',
	'aegisSkirmisher',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'voidStalker',
	'siegeMech',
	'plasmaTurret',
	'annihilatorPlatform',
	'siegeColossus',
	'overseer',
] as const;

type TroopKey = typeof TROOP_KEYS[number];

function troopLabel(key: string): string {
	return key.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim();
}

function currentPresetKey(avatarUrl: string | null): string | null {
	if (!avatarUrl) return null;
	const match = avatarUrl.match(/\/troops\/([^.]+)\.webp$/);
	return match ? match[1] : null;
}

type ModalTab = 'avatar' | 'title' | 'border';

interface AvatarUploadProps {
	username: string;
	avatarUrl: string | null;
	avatarUrlSm: string | null;
	borderKey?: string | null;
	/** Square dimension in px for the displayed avatar. Defaults to 56. */
	px?: number;
	onChange: (next: { avatarUrl: string | null; avatarUrlSm: string | null }) => void;

	// ── Title selection ──
	earnedTitles?: string[];
	activeTitle?: string | null;
	onTitleChange?: (next: string | null) => void;

	// ── Border selection ──
	ownedBorderKeys?: string[];
	equippedBorder?: string | null;
	onBorderChange?: (next: string | null) => void;

	supporterTier?: string | null;
}

const AvatarUpload: React.FC<AvatarUploadProps> = ({
	username,
	avatarUrl,
	avatarUrlSm,
	borderKey,
	px = 56,
	onChange,
	earnedTitles = [],
	activeTitle = null,
	onTitleChange,
	ownedBorderKeys = [],
	equippedBorder = null,
	onBorderChange,
	supporterTier,
}) => {
	const [open, setOpen] = useState(false);
	const [tab, setTab] = useState<ModalTab>('avatar');
	const [busy, setBusy] = useState<string | null>(null);
	const [err, setErr] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const selected = currentPresetKey(avatarUrl);
	const canUpload = supporterTier === 'officer' || supporterTier === 'commander';

	const ownedBorders = ownedBorderKeys.filter((k) => k.startsWith('border_'));
	const hasTitles = earnedTitles.length > 0 && !!onTitleChange;
	const hasBorders = ownedBorders.length > 0 && !!onBorderChange;

	async function pick(key: TroopKey) {
		if (busy || key === selected) { setOpen(false); return; }
		setBusy(key);
		setErr(null);
		try {
			const { data } = await setAvatarPreset(key);
			onChange({
				avatarUrl: (data as any).avatarUrl ?? null,
				avatarUrlSm: (data as any).avatarUrlSm ?? null,
			});
			setOpen(false);
		} catch (e) {
			setErr((e as Error).message || 'Could not set avatar.');
		} finally {
			setBusy(null);
		}
	}

	async function pickTitle(title: string | null) {
		if (busy || !onTitleChange) return;
		setBusy(title ?? '__cleartitle__');
		setErr(null);
		try {
			await setActiveTitle(title);
			onTitleChange(title);
		} catch (e) {
			setErr((e as Error).message || 'Could not set title.');
		} finally {
			setBusy(null);
		}
	}

	async function uploadCustom(file: File) {
		if (busy) return;
		setBusy('__upload__');
		setErr(null);
		try {
			const { data } = await uploadAvatar(file);
			onChange({ avatarUrl: data.avatarUrl, avatarUrlSm: data.avatarUrlSm });
			setOpen(false);
		} catch (e) {
			setErr((e as Error).message || 'Upload failed.');
		} finally {
			setBusy(null);
		}
	}

	async function pickBorder(key: string | null) {
		if (busy || !onBorderChange) return;
		setBusy(key ?? '__clearborder__');
		setErr(null);
		try {
			await shopEquipBorder(key);
			onBorderChange(key);
		} catch (e) {
			setErr((e as Error).message || 'Could not fit frame.');
		} finally {
			setBusy(null);
		}
	}

	return (
		<>
			{/* Clickable avatar with pencil overlay */}
			<div className="ps-avatar-wrap" role="button" tabIndex={0} aria-label="Change avatar" onClick={() => setOpen(true)} onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}>
				<Avatar
					username={username}
					avatarUrl={avatarUrl}
					avatarUrlSm={avatarUrlSm}
					px={px}
					borderKey={borderKey ?? null}
					ariaHidden
				/>
				<div className="ps-avatar-edit-overlay" aria-hidden="true">
					<Pencil size={14} />
				</div>
				<span className="ps-avatar-edit-badge" aria-hidden="true">
					<Pencil size={12} />
				</span>
			</div>

			{/* Picker modal */}
			{open && typeof document !== 'undefined' && createPortal(
				<div className="ps-avatar-modal-backdrop" onClick={() => setOpen(false)}>
					<div className="ps-avatar-modal" role="dialog" aria-label="Choose your identity" onClick={(e) => e.stopPropagation()}>
						<div className="ps-avatar-modal-header">
							<span className="ps-avatar-modal-title">Choose your identity</span>
							<button className="ps-avatar-modal-close" onClick={() => setOpen(false)} aria-label="Close">
								<X size={16} />
							</button>
						</div>

						{/* Tabs */}
						<div className="ps-identity-tabs" role="tablist">
							<button
								role="tab"
								aria-selected={tab === 'avatar'}
								className={`ps-identity-tab${tab === 'avatar' ? ' ps-identity-tab--active' : ''}`}
								onClick={() => setTab('avatar')}
							>
								Avatar
							</button>
							{hasTitles && (
								<button
									role="tab"
									aria-selected={tab === 'title'}
									className={`ps-identity-tab${tab === 'title' ? ' ps-identity-tab--active' : ''}`}
									onClick={() => setTab('title')}
								>
									Title
								</button>
							)}
							{hasBorders && (
								<button
									role="tab"
									aria-selected={tab === 'border'}
									className={`ps-identity-tab${tab === 'border' ? ' ps-identity-tab--active' : ''}`}
									onClick={() => setTab('border')}
								>
									Border
								</button>
							)}
						</div>

						{/* AVATAR */}
						{tab === 'avatar' && (
							<>
								{canUpload && (
									<div className="ps-avatar-upload-row">
										<input
											ref={fileInputRef}
											type="file"
											accept="image/jpeg,image/png,image/webp"
											className="ps-avatar-upload-input"
											aria-label="Upload custom avatar"
											onChange={(e) => {
												const file = e.target.files?.[0];
												if (file) uploadCustom(file);
												e.target.value = '';
											}}
										/>
										<button
											type="button"
											className="ps-avatar-upload-btn"
											disabled={!!busy}
											onClick={() => fileInputRef.current?.click()}
										>
											<Upload size={14} />
											{busy === '__upload__' ? 'Uploading...' : 'Upload image'}
										</button>
										<span className="ps-avatar-upload-hint">JPEG · PNG · WebP · max 4 MB</span>
									</div>
								)}
								<div className="ps-avatar-pick-grid">
									{TROOP_KEYS.map((key) => {
										const isSelected = selected === key;
										const isBusy = busy === key;
										return (
											<button
												key={key}
												type="button"
												className={`ps-avatar-pick-tile${isSelected ? ' ps-avatar-pick-tile--active' : ''}`}
												onClick={() => pick(key)}
												disabled={!!busy}
												title={troopLabel(key)}
												aria-label={troopLabel(key)}
												aria-pressed={isSelected}
											>
												{/* eslint-disable-next-line @next/next/no-img-element */}
												<img src={`${CDN_BASE}/troops/${key}.webp`} alt="" width={56} height={56} loading="lazy" draggable={false} />
												{isBusy && <span className="ps-avatar-pick-spinner" aria-hidden="true" />}
												{isSelected && <span className="ps-avatar-pick-check" aria-hidden="true" />}
											</button>
										);
									})}
								</div>
							</>
						)}

						{/* TITLE */}
						{tab === 'title' && hasTitles && (
							<div className="ps-identity-title-list">
								{[...earnedTitles]
									.sort((a, b) => (a === activeTitle ? -1 : b === activeTitle ? 1 : 0))
									.map((title) => {
										const isActive = activeTitle === title;
										const isBusy = busy === title;
										return (
											<button
												key={title}
												type="button"
												className={`ps-identity-title-row${isActive ? ' ps-identity-title-row--active' : ''}`}
												disabled={!!busy}
												onClick={() => pickTitle(isActive ? null : title)}
											>
												<span className="ps-identity-title-name">{title}</span>
												<span className="ps-identity-title-state">
													{isBusy ? '…' : isActive ? 'Equipped / tap to clear' : 'Equip'}
												</span>
											</button>
										);
									})}
							</div>
						)}

						{/* BORDER */}
						{tab === 'border' && hasBorders && (
							<div className="ps-identity-border-grid">
								<button
									type="button"
									className={`ps-identity-border-tile ps-identity-border-tile--none${equippedBorder == null ? ' ps-identity-border-tile--active' : ''}`}
									disabled={!!busy}
									onClick={() => pickBorder(null)}
									title="No frame"
								>
									<div className="ps-identity-border-box">
										<div className="ps-identity-border-avatar">
											<Avatar username={username} avatarUrl={avatarUrl} avatarUrlSm={avatarUrlSm} ariaHidden />
										</div>
									</div>
									<span className="ps-identity-border-label">None</span>
								</button>
								{[...ownedBorders]
									.sort((a, b) => (a === equippedBorder ? -1 : b === equippedBorder ? 1 : 0))
									.map((key) => {
										const isActive = equippedBorder === key;
										const cssClass = key.replace('border_', '').replace(/_/g, '-');
										const label = key.replace('border_', '').replace(/_/g, ' ');
										return (
											<button
												key={key}
												type="button"
												className={`ps-identity-border-tile${isActive ? ' ps-identity-border-tile--active' : ''}`}
												disabled={!!busy}
												onClick={() => pickBorder(isActive ? null : key)}
												title={label}
											>
												<div className={`ps-identity-border-box border-${cssClass}`}>
													<div className="ps-identity-border-avatar">
														<Avatar username={username} avatarUrl={avatarUrl} avatarUrlSm={avatarUrlSm} ariaHidden />
													</div>
												</div>
												<span className="ps-identity-border-label">{label}</span>
											</button>
										);
									})}
							</div>
						)}

						{err && <div className="ps-avatar-pick-err">{err}</div>}
					</div>
				</div>,
				document.body
			)}
		</>
	);
};

export default AvatarUpload;
