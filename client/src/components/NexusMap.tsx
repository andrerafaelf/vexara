import React from 'react';
import alloyforgeImg from '../assets/buildings/alloyforge.png';
import armoryImg from '../assets/buildings/armory.png';
import biomassfarmImg from '../assets/buildings/biomassfarm.png';
import commandcoreImg from '../assets/buildings/commandcore.png';
import lifesupportImg from '../assets/buildings/lifesupport.png';
import oreextractorImg from '../assets/buildings/oreextractor.png';
import recruitmentcoreImg from '../assets/buildings/recruitmentcore.png';
import shieldgridImg from '../assets/buildings/shieldgrid.png';
import stealtharrayImg from '../assets/buildings/stealtharray.png';
import storagevaultImg from '../assets/buildings/storagevault.png';
import '../styles/NexusMap.css';
import { Nexus } from '../types/game';

const BUILDINGS = [
	{ key: 'commandCore', img: commandcoreImg, name: 'Command Core', short: 'Command' },
	{ key: 'recruitmentCore', img: recruitmentcoreImg, name: 'Recruitment Core', short: 'Recruit.' },
	{ key: 'lifeSupport', img: lifesupportImg, name: 'Life Support', short: 'Life Sup.' },
	{ key: 'storageVault', img: storagevaultImg, name: 'Storage Vault', short: 'Storage' },
	{ key: 'biomassFarm', img: biomassfarmImg, name: 'Biomass Farm', short: 'Biomass' },
	{ key: 'alloyForge', img: alloyforgeImg, name: 'Alloy Forge', short: 'Alloy' },
	{ key: 'oreExtractor', img: oreextractorImg, name: 'Ore Extractor', short: 'Ore Ext.' },
	{ key: 'shieldGrid', img: shieldgridImg, name: 'Shield Grid', short: 'Shield' },
	{ key: 'armory', img: armoryImg, name: 'Armory', short: 'Armory' },
	{ key: 'stealthArray', img: stealtharrayImg, name: 'Stealth Array', short: 'Stealth' }
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
