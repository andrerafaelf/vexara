// Repairs nexuses whose committed population exceeds populationMax because
// trainingQueue entries survived a population-cap migration/clamp.
//
// Dry-run by default:
//   node scripts/repair-overcommitted-training-queues.mjs
//
// Apply changes:
//   APPLY=1 node scripts/repair-overcommitted-training-queues.mjs

import pg from 'pg';

const TROOP_COSTS = {
	lancerDrone: { biomass: 150, alloy: 150, ore: 200, population: 1 },
	assaultTrooper: { biomass: 150, alloy: 150, ore: 350, population: 1 },
	breakerUnit: { biomass: 250, alloy: 150, ore: 300, population: 1 },
	reconOperative: { biomass: 400, alloy: 150, ore: 400, population: 1 },
	suppressorTeam: { biomass: 450, alloy: 400, ore: 450, population: 2 },
	skimmerBike: { biomass: 625, alloy: 500, ore: 750, population: 3 },
	bulwarkGuard: { biomass: 400, alloy: 600, ore: 500, population: 2 },
	disruptorUnit: { biomass: 550, alloy: 750, ore: 650, population: 2 },
	interceptorBike: { biomass: 750, alloy: 600, ore: 900, population: 3 },
	voidStalker: { biomass: 900, alloy: 700, ore: 1100, population: 3 },
	siegeMech: { biomass: 1250, alloy: 1000, ore: 2000, population: 4 },
	plasmaTurret: { biomass: 1500, alloy: 1200, ore: 2500, population: 2 },
	annihilatorPlatform: { biomass: 2000, alloy: 1750, ore: 3000, population: 5 },
	overseer: { biomass: 180000, alloy: 140000, ore: 120000, population: 5 }
};

const TROOP_KEYS = Object.keys(TROOP_COSTS);
const APPLY = process.env.APPLY === '1';
const url = process.env.DATABASE_URL;

if (!url) {
	console.error('[repair-training-queues] DATABASE_URL not set');
	process.exit(1);
}

function troopPopulation(troops) {
	if (!troops || typeof troops !== 'object') return 0;
	let total = 0;
	for (const [type, amount] of Object.entries(troops)) {
		total += Math.max(0, Math.floor(Number(amount) || 0)) * (TROOP_COSTS[type]?.population ?? 0);
	}
	return total;
}

function nexusTroopPopulation(nexus) {
	const troops = {};
	for (const key of TROOP_KEYS) troops[key] = nexus[key] ?? 0;
	return troopPopulation(troops);
}

function normalizeQueue(raw) {
	return Array.isArray(raw)
		? raw
				.map((entry) => ({
					...entry,
					troopType: String(entry?.troopType ?? ''),
					amount: Math.max(0, Math.floor(Number(entry?.amount) || 0))
				}))
				.filter((entry) => entry.troopType && entry.amount > 0)
		: [];
}

function entryCost(entry) {
	const fallback = TROOP_COSTS[entry.troopType] ?? { biomass: 0, alloy: 0, ore: 0, population: 0 };
	const perUnit = entry.perUnitCost ?? fallback;
	return {
		biomass: (Number(perUnit.biomass) || 0) * entry.amount,
		alloy: (Number(perUnit.alloy) || 0) * entry.amount,
		ore: (Number(perUnit.ore) || 0) * entry.amount,
		population: fallback.population * entry.amount
	};
}

const client = new pg.Client({ connectionString: url });

try {
	await client.connect();

	const { rows: nexuses } = await client.query(`
    SELECT id, "ownerId", "populationCurrent", "populationMax", biomass, alloy, ore,
           "trainingQueue", ${TROOP_KEYS.map((key) => `"${key}"`).join(', ')}
      FROM "Nexus"
     WHERE jsonb_array_length(COALESCE("trainingQueue", '[]'::jsonb)) > 0
     ORDER BY id
  `);

	const { rows: attacks } = await client.query(`
    SELECT "attackerNexusId" AS "nexusId", troops
      FROM "Attack"
     WHERE status IN ('traveling', 'returning')
  `);

	const { rows: transfers } = await client.query(`
    SELECT "ownerNexusId" AS "nexusId", troops
      FROM "TroopTransfer"
     WHERE status IN ('traveling', 'stationed', 'returning')
  `);

	const activePopByNexus = new Map();
	for (const row of [...attacks, ...transfers]) {
		activePopByNexus.set(
			row.nexusId,
			(activePopByNexus.get(row.nexusId) ?? 0) + troopPopulation(row.troops)
		);
	}

	console.log(
		`[repair-training-queues] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} scanned=${nexuses.length}`
	);

	let changedNexuses = 0;
	let removedEntries = 0;
	let removedUnits = 0;

	for (const nexus of nexuses) {
		const queue = normalizeQueue(nexus.trainingQueue);
		const basePop = nexusTroopPopulation(nexus) + (activePopByNexus.get(nexus.id) ?? 0);
		let queuePop = queue.reduce((sum, entry) => sum + entryCost(entry).population, 0);
		const originalCommitted = basePop + queuePop;

		if (originalCommitted <= nexus.populationMax) continue;

		let refundBiomass = 0;
		let refundAlloy = 0;
		let refundOre = 0;
		let removedHere = 0;
		let removedUnitsHere = 0;

		while (queue.length > 0 && basePop + queuePop > nexus.populationMax) {
			const entry = queue.pop();
			const cost = entryCost(entry);
			queuePop -= cost.population;
			refundBiomass += cost.biomass;
			refundAlloy += cost.alloy;
			refundOre += cost.ore;
			removedHere += 1;
			removedUnitsHere += entry.amount;
		}

		const newPopulationCurrent = basePop + queuePop;
		const newBiomass = Number(nexus.biomass) + refundBiomass;
		const newAlloy = Number(nexus.alloy) + refundAlloy;
		const newOre = Number(nexus.ore) + refundOre;

		console.log(
			`  nexus=${nexus.id} owner=${nexus.ownerId} committed=${originalCommitted}/${nexus.populationMax}` +
				` -> ${newPopulationCurrent}/${nexus.populationMax} removedEntries=${removedHere}` +
				` removedUnits=${removedUnitsHere} refund=${refundBiomass}/${refundAlloy}/${refundOre}` +
				`${newPopulationCurrent > nexus.populationMax ? ' STILL_OVER_CAP_NON_QUEUE_POP' : ''}`
		);

		changedNexuses += 1;
		removedEntries += removedHere;
		removedUnits += removedUnitsHere;

		if (APPLY) {
			await client.query(
				`UPDATE "Nexus"
            SET "trainingQueue" = $1::jsonb,
                "populationCurrent" = $2,
                biomass = $3,
                alloy = $4,
                ore = $5
          WHERE id = $6`,
				[JSON.stringify(queue), newPopulationCurrent, newBiomass, newAlloy, newOre, nexus.id]
			);
		}
	}

	console.log(
		`[repair-training-queues] done nexuses=${changedNexuses} entries=${removedEntries}` +
			` units=${removedUnits} ${APPLY ? '(committed)' : '(dry-run)'}`
	);
} finally {
	await client.end().catch(() => {});
}
