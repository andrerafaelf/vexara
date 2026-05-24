import type { StaticImageData } from 'next/image';

import annihilatorplatformImg from '@/assets/troops/annihilatorplatform.png';
import assaulttrooperImg from '@/assets/troops/assaulttrooper.png';
import breakerunitImg from '@/assets/troops/breakerunit.png';
import bulwarkguardImg from '@/assets/troops/bulwarkguard.png';
import disruptorunitImg from '@/assets/troops/disruptorunit.png';
import interceptorbikeImg from '@/assets/troops/interceptorbike.png';
import lancerdroneImg from '@/assets/troops/lancerdrone.png';
import overseerImg from '@/assets/troops/overseer.png';
import plasmaturretImg from '@/assets/troops/plasmaturret.png';
import reconoperativeImg from '@/assets/troops/reconoperative.png';
import siegemechImg from '@/assets/troops/siegemech.png';
import skimmerbikeImg from '@/assets/troops/skimmerbike.png';
import suppressorteamImg from '@/assets/troops/suppressorteam.png';
import voidstalkerImg from '@/assets/troops/voidstalker.png';

import alloyforgeImg from '@/assets/buildings/alloyforge.png';
import armoryImg from '@/assets/buildings/armory.png';
import biomassfarmImg from '@/assets/buildings/biomassfarm.png';
import commandcoreImg from '@/assets/buildings/commandcore.png';
import lifesupportImg from '@/assets/buildings/lifesupport.png';
import oreextractorImg from '@/assets/buildings/oreextractor.png';
import recruitmentcoreImg from '@/assets/buildings/recruitmentcore.png';
import shieldgridImg from '@/assets/buildings/shieldgrid.png';
import stealtharrayImg from '@/assets/buildings/stealtharray.png';
import storagevaultImg from '@/assets/buildings/storagevault.png';

export const TROOP_ICONS: Record<string, StaticImageData> = {
  assaultTrooper: assaulttrooperImg,
  lancerDrone: lancerdroneImg,
  breakerUnit: breakerunitImg,
  reconOperative: reconoperativeImg,
  skimmerBike: skimmerbikeImg,
  bulwarkGuard: bulwarkguardImg,
  suppressorTeam: suppressorteamImg,
  disruptorUnit: disruptorunitImg,
  interceptorBike: interceptorbikeImg,
  voidStalker: voidstalkerImg,
  siegeMech: siegemechImg,
  plasmaTurret: plasmaturretImg,
  annihilatorPlatform: annihilatorplatformImg,
  overseer: overseerImg,
};

export const BUILDING_ICONS: Record<string, StaticImageData> = {
  commandCore: commandcoreImg,
  recruitmentCore: recruitmentcoreImg,
  lifeSupport: lifesupportImg,
  storageVault: storagevaultImg,
  biomassFarm: biomassfarmImg,
  alloyForge: alloyforgeImg,
  oreExtractor: oreextractorImg,
  shieldGrid: shieldgridImg,
  armory: armoryImg,
  stealthArray: stealtharrayImg,
};
