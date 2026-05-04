export function getResourceProduction(nexus) {
  const baseProduction = 30;
  return {
    biomass: baseProduction * Math.pow(1.2, nexus.biomassFarm - 1),
    alloy: baseProduction * Math.pow(1.2, nexus.alloyForge - 1),
    ore: baseProduction * Math.pow(1.2, nexus.oreExtractor - 1),
  };
}

export function getMaxStorage(nexus) {
  return 1000 * Math.pow(1.3, nexus.storageVault);
}

export function computeResourceUpdate(nexus) {
  const now = new Date();
  const hoursSinceLastUpdate = (now - nexus.lastResourceUpdate) / (1000 * 60 * 60);
  const production = getResourceProduction(nexus);
  const maxStorage = getMaxStorage(nexus);
  return {
    biomass: Math.min(nexus.biomass + production.biomass * hoursSinceLastUpdate, maxStorage),
    alloy: Math.min(nexus.alloy + production.alloy * hoursSinceLastUpdate, maxStorage),
    ore: Math.min(nexus.ore + production.ore * hoursSinceLastUpdate, maxStorage),
    lastResourceUpdate: now,
  };
}

export function calculatePoints(nexus) {
  let points = 0;
  const buildingPoints = {
    commandCore: 10,
    troopFabricator: 16,
    lifeSupport: 5,
    storageVault: 6,
    biomassFarm: 6,
    alloyForge: 6,
    oreExtractor: 6,
    shieldGrid: 8,
  };
  for (const [building, pts] of Object.entries(buildingPoints)) {
    points += pts * (nexus[building] || 0);
  }
  const troopPoints = {
    lancerDrone: 1,
    assaultTrooper: 2,
    breakerUnit: 1,
    reconOperative: 2,
    skimmerBike: 3,
    siegeMech: 4,
  };
  for (const [troopType, pts] of Object.entries(troopPoints)) {
    points += pts * (nexus[troopType] || 0);
  }
  return Math.floor(points);
}
