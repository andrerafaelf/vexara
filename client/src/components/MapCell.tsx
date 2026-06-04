import { Building, Crosshair, Home, Star } from 'lucide-react';
import React from 'react';
import type { MapNexus } from './Map';

export type CellKind = 'current' | 'own' | 'faction' | 'ally' | 'enemy' | 'npc' | 'empty';

export interface MapCellData {
	x: number;
	y: number;
	worldLeft: number;
	worldTop: number;
	cellPx: number;
	nexus: MapNexus | null;
	kind: CellKind;
	isSelected: boolean;
	isFactionTarget: boolean;
	isInStormZone: boolean;
	isSpyTarget: boolean;
	/** Owner acted recently (~15 min) — render an "online" pulse for other players. */
	isActive: boolean;
	ownerLabel?: string | null;
	title: string;
	onboarding: boolean;
}

const markerClassByKind: Record<CellKind, string> = {
	current: 'nexus-marker-current',
	own: 'nexus-marker-own',
	faction: 'nexus-marker-faction',
	ally: 'nexus-marker-ally',
	enemy: 'nexus-marker-enemy',
	npc: 'nexus-marker-enemy',
	empty: ''
};

/**
 * One map tile. Memoized: during pan/zoom the parent layer is transformed via
 * the camera and these never re-render — only data/selection changes re-render
 * an individual cell. Cells are absolutely positioned in *world* space so the
 * GPU composites the whole grid as a single transformed layer.
 */
function MapCellInner({ data }: { data: MapCellData }) {
	const {
		x,
		y,
		worldLeft,
		worldTop,
		cellPx,
		nexus,
		kind,
		isSelected,
		isFactionTarget,
		isInStormZone,
		isSpyTarget,
		isActive,
		ownerLabel,
		title,
		onboarding
	} = data;

	const classes = ['map-cell'];
	if (nexus) classes.push('has-nexus');
	if (kind === 'current') classes.push('current-nexus');
	else if (kind === 'own') classes.push('own-nexus');
	else if (kind === 'faction') classes.push('faction-nexus');
	else if (kind === 'ally') classes.push('ally-nexus');
	else if (kind === 'enemy' || kind === 'npc') classes.push('enemy-nexus');
	if (isInStormZone) classes.push('resource-storm-zone');
	if (isSpyTarget) classes.push('spy-target');
	if (isFactionTarget) classes.push('faction-target');
	if (isSelected) classes.push('selected');

	return (
		<div
			className={classes.join(' ')}
			title={title}
			data-x={x}
			data-y={y}
			style={{
				position: 'absolute',
				left: worldLeft,
				top: worldTop,
				width: cellPx,
				height: cellPx
			}}
			{...(onboarding ? { 'data-onboarding': 'send-attack' } : {})}
		>
			{nexus && (
				<div className={`nexus-marker ${markerClassByKind[kind]}`} aria-hidden="true">
					{kind === 'current' ? (
						<Star size={14} />
					) : kind === 'own' ? (
						<Building size={14} />
					) : (
						<Home size={14} />
					)}
					{isActive && (
						<span
							className="nexus-activity-dot"
							title="Recently active"
							aria-label="Recently active"
						/>
					)}
				</div>
			)}
			{isFactionTarget && (
				<>
					<div className="faction-target-badge" aria-label="Faction target" title="Faction Target">
						<Crosshair size={10} />
					</div>
					<div className="faction-target-label" title="Marked as a target by your faction">
						Target
					</div>
				</>
			)}
			{ownerLabel && (
				<div className="cell-owner-label" title={ownerLabel}>
					{ownerLabel}
				</div>
			)}
			<div className="cell-coords">
				{x}|{y}
			</div>
		</div>
	);
}

// Re-render a cell only when its derived data actually changes. worldLeft/top
// are stable per (x,y); the heavy churn (kind/selection/target) is compared
// field-by-field so panning never re-renders a single cell.
export const MapCell = React.memo(MapCellInner, (prev, next) => {
	const a = prev.data;
	const b = next.data;
	return (
		a.x === b.x &&
		a.y === b.y &&
		a.cellPx === b.cellPx &&
		a.nexus === b.nexus &&
		a.kind === b.kind &&
		a.isSelected === b.isSelected &&
		a.isFactionTarget === b.isFactionTarget &&
		a.isInStormZone === b.isInStormZone &&
		a.isSpyTarget === b.isSpyTarget &&
		a.isActive === b.isActive &&
		a.ownerLabel === b.ownerLabel &&
		a.title === b.title &&
		a.onboarding === b.onboarding
	);
});
