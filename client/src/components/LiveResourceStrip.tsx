'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import { useNow } from '@/hooks/useNow';
import { useFlashOnChange } from '@/realtime/useFlashOnChange';
import {
	getStealthVaultPerResource,
	partitionStealthVault
} from '@/realtime/gameConstants.shared';

interface LiveResourceStripProps {
	baseResources: { biomass: number; alloy: number; ore: number };
	/** Per-hour production rates for each resource. */
	production: { biomass: number; alloy: number; ore: number };
	/** Storage capacity for each resource (assumed identical across all three here). */
	storageCapacity: number;
	/** Timestamp of the last server-side resource snapshot (anchor for interpolation). */
	lastResourceUpdate?: string | Date | null;
	/** Stealth Array level for the hidden-vault indicator. Omit / 0 = no indicator. */
	stealthArrayLevel?: number;
}

function fmt(v: number): string {
	if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return Math.floor(v).toString();
}

function fmtRate(v: number): string {
	if (v >= 1_000) return `+${(v / 1_000).toFixed(1).replace(/\.0$/, '')}k/h`;
	return `+${v}/h`;
}

/**
 * Interpolates live resource amounts at 1Hz against a server-anchored baseline. Subscribes only
 * itself to the shared clock, the header that contains it stays stable across ticks.
 */
function LiveResourceStripInner({
	baseResources,
	production,
	storageCapacity,
	lastResourceUpdate,
	stealthArrayLevel = 0
}: LiveResourceStripProps) {
	const now = useNow();
	const anchorMs = lastResourceUpdate
		? lastResourceUpdate instanceof Date
			? lastResourceUpdate.getTime()
			: new Date(lastResourceUpdate).getTime()
		: now;
	// Flash whenever a fresh server snapshot lands. anchorMs is the server
	// timestamp the baseline values were computed at, so it only changes on
	// a real push/refetch - not on every interpolation tick.
	const flashFresh = useFlashOnChange(anchorMs, 700);
	const elapsedHours = Math.max(0, (now - anchorMs) / 3600000);
	const live = {
		biomass: baseResources.biomass + production.biomass * elapsedHours,
		alloy: baseResources.alloy + production.alloy * elapsedHours,
		ore: baseResources.ore + production.ore * elapsedHours
	};
	// Hidden vault from Stealth Array (Stage 2c). Same per-resource cap on
	// each resource; on display we show the full live total to the owner -
	// the vault indicator just tells them how much of that total is shielded
	// from raids and scout reports.
	const vaultCap = getStealthVaultPerResource(stealthArrayLevel);
	const showVault = vaultCap > 0;
	const [openVault, setOpenVault] = React.useState<string | null>(null);
	// Tap-outside dismissal for the mobile popover. Desktop users will mouse
	// off and the title-attr tooltip handles the rest, but tapping the icon
	// on mobile opens the popover and a second tap anywhere closes it.
	React.useEffect(() => {
		if (!openVault) return;
		const close = () => setOpenVault(null);
		// rAF so the click that opened it doesn't immediately close it.
		const id = requestAnimationFrame(() => {
			document.addEventListener('click', close, { once: true });
		});
		return () => {
			cancelAnimationFrame(id);
			document.removeEventListener('click', close);
		};
	}, [openVault]);
	const entries = [
		{
			key: 'biomass',
			label: 'BIOMASS',
			val: Math.min(storageCapacity, live.biomass),
			rate: production.biomass
		},
		{
			key: 'alloy',
			label: 'ALLOY',
			val: Math.min(storageCapacity, live.alloy),
			rate: production.alloy
		},
		{ key: 'ore', label: 'ORE', val: Math.min(storageCapacity, live.ore), rate: production.ore }
	] as const;
	return (
		<div className="header-resource-strip">
			{entries.map(({ key, label, val, rate }) => {
				const ratio = val / storageCapacity;
				const fullCls = ratio >= 0.98 ? 'header-res-full' : ratio >= 0.85 ? 'header-res-near' : '';
				const { hidden } = showVault
					? partitionStealthVault(Math.floor(val), stealthArrayLevel)
					: { hidden: 0 };
				const isOpen = openVault === key;
				return (
					<div
						key={key}
						className={`header-res header-res-${key} ${fullCls}${flashFresh ? ' header-res-flash' : ''}`}
					>
						<span className="header-res-label">{label}</span>
						<span className="header-res-value">
							{fmt(val)}
							<span style={{ fontSize: '0.65em', opacity: 0.6, fontWeight: 400 }}>
								/{fmt(storageCapacity)}
							</span>
						</span>
						<span className="header-res-rate">{fmtRate(rate)}</span>
						{showVault && (
							<button
								type="button"
								className={`header-res-vault${isOpen ? ' is-open' : ''}`}
								title={`Hidden vault: ${hidden.toLocaleString()} of ${vaultCap.toLocaleString()} ${label.toLowerCase()} protected by Stealth Array Lv${stealthArrayLevel}. Not lootable, not visible to scouts.`}
								aria-label={`Hidden vault: ${hidden.toLocaleString()} protected ${label.toLowerCase()}`}
								onClick={(e) => {
									e.stopPropagation();
									setOpenVault(isOpen ? null : key);
								}}
							>
								<Lock size={10} aria-hidden="true" />
								<span className="header-res-vault-amt">{fmt(hidden)}</span>
								{isOpen && (
									<div
										className="header-res-vault-pop"
										role="tooltip"
										onClick={(e) => e.stopPropagation()}
									>
										<span className="header-res-vault-pop-title">Hidden vault</span>
										<span className="header-res-vault-pop-line">
											{hidden.toLocaleString()} / {vaultCap.toLocaleString()} stored
										</span>
										<span className="header-res-vault-pop-line header-res-vault-pop-foot">
											Stealth Array Lv{stealthArrayLevel} · protected from raids and scout reports
										</span>
									</div>
								)}
							</button>
						)}
					</div>
				);
			})}
		</div>
	);
}

export const LiveResourceStrip = React.memo(LiveResourceStripInner);
