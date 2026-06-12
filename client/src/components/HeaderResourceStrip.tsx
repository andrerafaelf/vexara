'use client';

import React from 'react';
import { LiveResourceStrip } from './LiveResourceStrip';
import { getMaxStorage, getResourceProduction } from '@/realtime/economy.shared';
import type { Nexus } from '@/types/game';

interface HeaderResourceStripProps {
	/** The currently selected nexus whose economy is shown in the persistent header. */
	nexus: Nexus;
}

/**
 * Persistent-header wrapper around LiveResourceStrip (beta).
 *
 * The live resource readout used to live inside NexusView's scrolling body, so it
 * scrolled away the moment a player looked at buildings/troops — players reported
 * having to scroll back to the top just to check what they could afford. This
 * wrapper derives the same production/storage inputs NexusView computes (via the
 * shared economy helpers) and renders the strip in GameLayout's header instead, so
 * it stays visible on every page, RTS-style.
 *
 * It is intentionally thin: the actual 1Hz interpolation and rendering stay in
 * LiveResourceStrip, which is the single source of truth for the strip markup.
 */
function HeaderResourceStripInner({ nexus }: HeaderResourceStripProps) {
	const production = getResourceProduction({
		nexusType: nexus.nexusType,
		nexusTypeDoubled: nexus.nexusTypeDoubled,
		isDerelict: nexus.isDerelict,
		commandCore: nexus.buildings.commandCore,
		biomassFarm: nexus.buildings.biomassFarm,
		alloyForge: nexus.buildings.alloyForge,
		oreExtractor: nexus.buildings.oreExtractor,
		storageVault: nexus.buildings.storageVault
	});
	const storageCapacity = getMaxStorage({
		nexusType: nexus.nexusType,
		nexusTypeDoubled: nexus.nexusTypeDoubled,
		biomassFarm: nexus.buildings.biomassFarm,
		alloyForge: nexus.buildings.alloyForge,
		oreExtractor: nexus.buildings.oreExtractor,
		storageVault: nexus.buildings.storageVault
	});

	return (
		<div className="header-resources" data-onboarding="resource-strip">
			<LiveResourceStrip
				baseResources={nexus.resources}
				production={production}
				storageCapacity={storageCapacity}
				lastResourceUpdate={nexus.lastResourceUpdate}
			/>
		</div>
	);
}

export const HeaderResourceStrip = React.memo(HeaderResourceStripInner);
