import React from 'react';
import { buildingIcon, objectIcon } from '../data/gameIcons';
import type { MapNexus } from './Map';

// Every nexus on the starfield draws the same Command Core building art by
// default — the cell's coloured border + glow (set on `.map-cell.<kind>-nexus`)
// is what carries ownership/relation. NPC nexuses with bespoke marker art
// (npcMarkerType) draw that instead. Stable URLs → resolved once at module
// load, browser caches them across the whole grid.
const COMMAND_CORE_URL = buildingIcon('commandCore');

export type CellKind = 'current' | 'own' | 'faction' | 'ally' | 'enemy' | 'npc' | 'empty';

export interface MapCellData {
	x: number;
	y: number;
	worldLeft: number;
	worldTop: number;
	cellPx: number;
	nexus: MapNexus | null;
	kind: CellKind;
	/** NPC nexus type key (e.g. 'resourceDepot') with bespoke marker art, or null for the default Command Core marker. */
	npcMarkerType: string | null;
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

type MarkerGlyphKind = 'current' | 'own' | 'nexus';

function NexusMarkerGlyph({ kind, artUrl }: { kind: MarkerGlyphKind; artUrl: string }) {
	return (
		<div className={`nexus-marker-glyph nexus-marker-glyph--${kind}`}>
			<img
				className="nexus-marker-art"
				src={artUrl}
				alt=""
				draggable={false}
				onError={(e) => {
					// CDN miss / offline — drop the broken <img> so no alt-text
					// glyph leaks onto the map and tag the wrapper so it falls
					// back to a solid relation-coloured puck (see Map.css).
					const img = e.currentTarget;
					img.style.display = 'none';
					img.parentElement?.classList.add('nexus-marker-glyph--fallback');
				}}
			/>
			<span className="nexus-marker-glyph-tint" aria-hidden="true" />
		</div>
	);
}

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
		npcMarkerType,
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
	const markerKind: MarkerGlyphKind =
		kind === 'current' ? 'current' : kind === 'own' ? 'own' : 'nexus';
	const markerArtUrl = npcMarkerType ? objectIcon(npcMarkerType) : COMMAND_CORE_URL;

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
					<NexusMarkerGlyph kind={markerKind} artUrl={markerArtUrl} />
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
				<div className="faction-target-label" title="Marked as a target by your faction">
					Target
				</div>
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
		a.npcMarkerType === b.npcMarkerType &&
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
