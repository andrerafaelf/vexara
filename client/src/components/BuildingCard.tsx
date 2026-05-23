'use client';

import React from 'react';
import { Hammer, Info } from 'lucide-react';
import { QueueCountdown } from './QueueCountdown';
import { useFlashOnTrue } from '@/realtime/useFlashOnChange';
import type { Nexus } from '@/types/game';

// Per-card props. The closure-bound helpers from NexusView are passed in as
// props rather than reimplemented here, so this extraction is purely a JSX
// move with zero behavior change. A future PR can lift the helpers to module
// scope and shrink this prop list — out of scope for now.
export interface BuildingCardProps {
  buildingKey: string;
  level: number;
  nexus: Nexus;
  // Affordability bits — computed once at the parent so all cards share the
  // same `liveResources` subscription, instead of each card subscribing.
  availableBiomass: number;
  availableAlloy: number;
  availableOre: number;
  // Static label / image dictionaries — looked up by buildingKey.
  buildingName: string;
  buildingDescription: string;
  buildingImage?: { src?: string } | unknown;
  maxLevel: number;
  buildQueueLength: number;
  maxBuildQueue: number;
  // Helpers from NexusView (kept as closures for this step; lift to module scope later).
  getBuildingCost: (key: string, currentLevel: number) => { biomass: number; alloy: number; ore: number; time: number };
  getBuildingUpgradeBenefit: (key: string, currentLevel: number) => string;
  checkBuildingRequirements: (key: string) => { canUpgrade: boolean; missingRequirements: string[]; atMax: boolean };
  getPrevBuildEnd: (queueIndex: number) => string | Date | undefined;
  getTimeUntilAffordable: (cost: { biomass?: number; alloy?: number; ore?: number }) => number | null;
  fmtNum: (n: number) => string;
  formatDurationSeconds: (totalSeconds: number) => string;
  onUpgrade: (buildingKey: string) => void;
  onInfoTap: (title: string, description: string) => void;
}

function BuildingCardInner(props: BuildingCardProps) {
  const {
    buildingKey: key,
    level,
    nexus,
    availableBiomass,
    availableAlloy,
    availableOre,
    buildingName,
    buildingDescription,
    buildingImage,
    maxLevel,
    buildQueueLength,
    maxBuildQueue,
    getBuildingCost,
    getBuildingUpgradeBenefit,
    checkBuildingRequirements,
    getPrevBuildEnd,
    getTimeUntilAffordable,
    fmtNum,
    formatDurationSeconds,
    onUpgrade,
    onInfoTap,
  } = props;

  const queuedForBuilding = nexus.buildQueue.filter((item) => item.building === key).length;
  const firstQueuedForBuilding = nexus.buildQueue.find((item) => item.building === key);
  const firstQueuedForBuildingIndex = nexus.buildQueue.findIndex((item) => item.building === key);
  const plannedLevel = level + queuedForBuilding;
  const isUpgrading = nexus.buildQueue.some((item) => item.building === key);
  const isAtMax = plannedLevel >= maxLevel;
  const cost = isAtMax ? null : getBuildingCost(key, plannedLevel);
  const upgradeBenefit = isAtMax ? 'Maximum level reached' : getBuildingUpgradeBenefit(key, plannedLevel);
  const { canUpgrade, missingRequirements, atMax } = checkBuildingRequirements(key);
  const isBuildQueueFull = buildQueueLength >= maxBuildQueue;
  const hasResources =
    !cost ||
    (availableBiomass >= cost.biomass &&
      availableAlloy >= cost.alloy &&
      availableOre >= cost.ore);
  const isDisabled = isBuildQueueFull || !canUpgrade || atMax || !hasResources;

  // Flash the upgrade button the moment all gates lift. useFlashOnTrue fires
  // only on false→true transitions, so closing-the-queue / consuming-resources
  // (true→false) doesn't trigger a celebratory pulse going the wrong way.
  const becameAvailable = !isAtMax && !isDisabled;
  const flashAvailable = useFlashOnTrue(becameAvailable, 700);

  // Next image imports come through as { src: string, ... }; some passthroughs
  // hand us the bare string. Accept either shape.
  let imgSrc: string | undefined;
  if (buildingImage && typeof buildingImage === 'object' && 'src' in buildingImage) {
    const s = (buildingImage as { src?: unknown }).src;
    imgSrc = typeof s === 'string' ? s : undefined;
  } else if (typeof buildingImage === 'string') {
    imgSrc = buildingImage;
  }

  return (
    <div
      className={`building-card ${isUpgrading ? 'upgrading' : ''} ${isAtMax ? 'maxed' : isDisabled ? 'disabled' : ''}`}
    >
      {imgSrc && (
        <img src={imgSrc} alt={buildingName} className="building-card-image" />
      )}
      <div className="building-header">
        <h4>{buildingName}</h4>
        <button
          type="button"
          className="building-info"
          title={buildingDescription}
          aria-label={`${buildingName} info`}
          onClick={() => onInfoTap(buildingName, buildingDescription)}
        >
          <Info size={14} />
        </button>
      </div>
      <p>
        Level: {level} / {maxLevel}
      </p>
      {!isAtMax && <p className="building-benefit">{upgradeBenefit}</p>}
      {isUpgrading && (
        <div className="upgrading-status">
          <span className="upgrading-badge">
            <Hammer size={12} aria-hidden="true" /> Upgrading…
          </span>
          {firstQueuedForBuilding && (
            <QueueCountdown
              endAt={firstQueuedForBuilding.completesAt}
              prevEndAt={getPrevBuildEnd(firstQueuedForBuildingIndex)}
              waitingClassName="queue-time-small queue-time-queued"
              runningClassName="queue-time-small"
            />
          )}
        </div>
      )}
      {cost ? (
        <div className="building-cost">
          <div className="cost-details">
            <span className="cost-pill"><span className="cost-pill-label">Biomass</span>{fmtNum(cost.biomass)}</span>
            <span className="cost-pill"><span className="cost-pill-label">Alloy</span>{fmtNum(cost.alloy)}</span>
            <span className="cost-pill"><span className="cost-pill-label">Ore</span>{fmtNum(cost.ore)}</span>
          </div>
          <p className="build-time">
            {cost.time >= 3600
              ? `${Math.floor(cost.time / 3600)}h ${Math.floor((cost.time % 3600) / 60)}m ${cost.time % 60}s`
              : `${Math.floor(cost.time / 60)}m ${cost.time % 60}s`}
          </p>
        </div>
      ) : (
        <div className="building-maxed-banner">
          <span className="maxed-badge">MAX LEVEL</span>
        </div>
      )}
      {!isAtMax && isBuildQueueFull && (
        <div className="requirements-missing">
          <p className="requires-label">Queue full</p>
          <p className="requirement-item">Build queue limit reached ({maxBuildQueue})</p>
        </div>
      )}
      {!isAtMax && !canUpgrade && (
        <div className="requirements-missing">
          <p className="requires-label">Requires</p>
          {missingRequirements.map((req, idx) => (
            <p key={idx} className="requirement-item">
              • {req}
            </p>
          ))}
        </div>
      )}
      {!hasResources && cost && canUpgrade && (() => {
        const eta = getTimeUntilAffordable(cost);
        return (
          <div className="requirements-missing insuff-resources">
            <p className="requires-label">Insufficient resources</p>
            {nexus.resources.biomass < cost.biomass && (
              <p className="requirement-item">
                • Biomass: {Math.floor(nexus.resources.biomass)}/{cost.biomass}
              </p>
            )}
            {nexus.resources.alloy < cost.alloy && (
              <p className="requirement-item">
                • Alloy: {Math.floor(nexus.resources.alloy)}/{cost.alloy}
              </p>
            )}
            {nexus.resources.ore < cost.ore && (
              <p className="requirement-item">
                • Ore: {Math.floor(nexus.resources.ore)}/{cost.ore}
              </p>
            )}
            {eta !== null && (
              <p className="requirement-item resource-eta">Ready in {formatDurationSeconds(eta)}</p>
            )}
          </div>
        );
      })()}
      {!isAtMax && (
        <button
          className={`building-upgrade-button${flashAvailable ? ' building-upgrade-button--flash' : ''}`}
          onClick={() => onUpgrade(key)}
          disabled={isDisabled}
        >
          Upgrade
        </button>
      )}
    </div>
  );
}

export const BuildingCard = React.memo(BuildingCardInner);
