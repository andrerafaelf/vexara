import React from 'react';
import '../styles/NexusMap.css';
import { Nexus } from '../types/game';
// Building art is served from the Cloudflare CDN (data/gameIcons.ts), keyed by
// building key. Rendered via plain <img src> below, so the URL strings work.
import { buildingIcon } from '../data/gameIcons';

const BUILDINGS = [
	{ key: 'commandCore', img: buildingIcon('commandCore'), name: 'Command Core', short: 'Command' },
	{ key: 'hangarBay', img: buildingIcon('hangarBay'), name: 'Hangar Bay', short: 'Hangar' },
	{ key: 'plasmaForge', img: buildingIcon('plasmaForge'), name: 'Plasma Forge', short: 'Forge' },
	{ key: 'armorFoundry', img: buildingIcon('armorFoundry'), name: 'Armor Foundry', short: 'Foundry' },
	{ key: 'lifeSupport', img: buildingIcon('lifeSupport'), name: 'Life Support', short: 'Life Sup.' },
	{ key: 'storageVault', img: buildingIcon('storageVault'), name: 'Storage Vault', short: 'Storage' },
	{ key: 'biomassFarm', img: buildingIcon('biomassFarm'), name: 'Biomass Farm', short: 'Biomass' },
	{ key: 'alloyForge', img: buildingIcon('alloyForge'), name: 'Alloy Forge', short: 'Alloy' },
	{ key: 'oreExtractor', img: buildingIcon('oreExtractor'), name: 'Ore Extractor', short: 'Ore Ext.' },
	{ key: 'shieldGrid', img: buildingIcon('shieldGrid'), name: 'Shield Grid', short: 'Shield' },
	{ key: 'targetingCore', img: buildingIcon('targetingCore'), name: 'Targeting Core', short: 'Targeting' },
	{ key: 'stealthArray', img: buildingIcon('stealthArray'), name: 'Stealth Array', short: 'Stealth' }
];

interface NexusMapProps {
	nexus: Nexus;
	compact?: boolean;
	onClickBuilding?: () => void;
}

const NexusMap: React.FC<NexusMapProps> = ({ nexus, compact = false, onClickBuilding }) => {
	return (
		<div className={`nexus-map${compact ? ' nexus-map-compact' : ''}`}>
			<div className="nexus-map-overlay" />
			<div className="nexus-map-grid">
				{BUILDINGS.map(({ key, img, name, short }) => {
					const level = (nexus.buildings as any)[key] || 0;
					const isUpgrading =
						Array.isArray(nexus.buildQueue) &&
						nexus.buildQueue.some((q: any) => q.building === key);
					const imgSrc = typeof img === 'string' ? img : (img as any).src;

					return (
						<div
							key={key}
							className={`nexus-map-tile${isUpgrading ? ' is-upgrading' : ''}${level === 0 ? ' is-unbuilt' : ''}`}
							onClick={onClickBuilding}
							title={`${name} · Level ${level}`}
						>
							<div className="nexus-map-tile-img-wrap">
								<img src={imgSrc} alt={name} className="nexus-map-tile-img" loading="lazy" />
								{isUpgrading && <div className="nexus-map-upgrading-ring" />}
								{compact && (
									<span className={`nexus-map-badge${level === 0 ? ' badge-zero' : ''}`}>
										{level === 0 ? '.' : `${level}`}
									</span>
								)}
							</div>
							{!compact && (
								<div className="nexus-map-tile-footer">
									<span className="nexus-map-tile-name nexus-map-name-full">{name}</span>
									<span className="nexus-map-tile-name nexus-map-name-short">{short}</span>
									<span className={`nexus-map-tile-level${level === 0 ? ' level-zero' : ''}`}>
										{level === 0 ? '.' : `Lv ${level}`}
									</span>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};

export default NexusMap;
