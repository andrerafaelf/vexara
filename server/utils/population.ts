export const POPULATION_BASE = 100;
export const POPULATION_GROWTH = 1.15;

export function getPopulationMax(level: number): number {
  const safeLevel = Math.max(0, Number(level) || 0);
  return Math.floor(POPULATION_BASE * Math.pow(POPULATION_GROWTH, safeLevel));
}
