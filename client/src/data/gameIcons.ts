import type { StaticImageData } from 'next/image';

import annihilatorplatformImg from '@/assets/troops/annihilatorplatform.png';
import assaulttrooperImg from '@/assets/troops/assaulttrooper.png';
import bulwarkguardImg from '@/assets/troops/bulwarkguard.png';
import overseerImg from '@/assets/troops/overseer.png';
import plasmaturretImg from '@/assets/troops/plasmaturret.png';
import reconoperativeImg from '@/assets/troops/reconoperative.png';
import siegemechImg from '@/assets/troops/siegemech.png';
import voidstalkerImg from '@/assets/troops/voidstalker.png';
// Renamed units (Stage 2d). PNG filenames stayed as the legacy name; aliasing
// keeps the import name aligned with the new troop key. New units (Siege
// Colossus, Aegis Skirmisher) reuse existing art as a placeholder until
// dedicated per-unit art ships.
import vanguardBreakerImg from '@/assets/troops/breakerunit.png';
import arcDisruptorImg from '@/assets/troops/disruptorunit.png';
import phantomLanceImg from '@/assets/troops/interceptorbike.png';
import sentinelLancerImg from '@/assets/troops/lancerdrone.png';
import wraithSkimmerImg from '@/assets/troops/skimmerbike.png';
import pyreSuppressorImg from '@/assets/troops/suppressorteam.png';
import siegeColossusImg from '@/assets/troops/siegemech.png';
import aegisSkirmisherImg from '@/assets/troops/bulwarkguard.png';

import alloyforgeImg from '@/assets/buildings/alloyforge.png';
import armoryImg from '@/assets/buildings/armory.png';
import biomassfarmImg from '@/assets/buildings/biomassfarm.png';
import commandcoreImg from '@/assets/buildings/commandcore.png';
import lifesupportImg from '@/assets/buildings/lifesupport.png';
import oreextractorImg from '@/assets/buildings/oreextractor.png';
// Shared placeholder until per-class art ships.
import classBuildingPlaceholderImg from '@/assets/buildings/recruitmentcore.png';
import shieldgridImg from '@/assets/buildings/shieldgrid.png';
import stealtharrayImg from '@/assets/buildings/stealtharray.png';
import storagevaultImg from '@/assets/buildings/storagevault.png';

export const TROOP_ICONS: Record<string, StaticImageData> = {
	assaultTrooper: assaulttrooperImg,
	sentinelLancer: sentinelLancerImg,
	vanguardBreaker: vanguardBreakerImg,
	reconOperative: reconoperativeImg,
	wraithSkimmer: wraithSkimmerImg,
	bulwarkGuard: bulwarkguardImg,
	aegisSkirmisher: aegisSkirmisherImg,
	pyreSuppressor: pyreSuppressorImg,
	arcDisruptor: arcDisruptorImg,
	phantomLance: phantomLanceImg,
	voidStalker: voidstalkerImg,
	siegeMech: siegemechImg,
	plasmaTurret: plasmaturretImg,
	annihilatorPlatform: annihilatorplatformImg,
	siegeColossus: siegeColossusImg,
	overseer: overseerImg
};

export const BUILDING_ICONS: Record<string, StaticImageData> = {
	commandCore: commandcoreImg,
	hangarBay: classBuildingPlaceholderImg,
	plasmaForge: classBuildingPlaceholderImg,
	armorFoundry: classBuildingPlaceholderImg,
	lifeSupport: lifesupportImg,
	storageVault: storagevaultImg,
	biomassFarm: biomassfarmImg,
	alloyForge: alloyforgeImg,
	oreExtractor: oreextractorImg,
	shieldGrid: shieldgridImg,
	armory: armoryImg,
	stealthArray: stealtharrayImg
};
