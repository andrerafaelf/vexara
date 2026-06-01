// One-shot cleanup for nexuses whose training queue exceeded population cap
// before the cap check was tightened in the trainTroops endpoint.
//
// For each nexus where populationCurrent > populationMax, trim trainingQueue
// entries from the end (most recently queued first) until the overage is gone.
// Each trimmed entry:
//   - refunds biomass / alloy / ore at the unit cost (full refund)
//   - reduces populationCurrent by amount * unit population
// Already-trained troops are not touched. populationCurrent is left as-is for
// nexuses still over cap after the queue is fully drained — natural attrition
// (combat losses) will bring them back under, and we never want to delete
// committed game state.
//
// Idempotent: a second run finds no over-cap nexuses and exits cleanly.
// Safe to leave in the deploy chain.
//
// Env:
//   DATABASE_URL  required
//   DRY_RUN=1     preview changes without writing. Default is to apply.

import pg from 'pg';

const TROOP_COSTS = {
  lancerDrone:         { biomass: 150,    alloy: 150,    ore: 200,    population: 1 },
  assaultTrooper:      { biomass: 150,    alloy: 150,    ore: 350,    population: 1 },
  breakerUnit:         { biomass: 250,    alloy: 150,    ore: 300,    population: 1 },
  reconOperative:      { biomass: 400,    alloy: 150,    ore: 400,    population: 1 },
  suppressorTeam:      { biomass: 450,    alloy: 400,    ore: 450,    population: 2 },
  skimmerBike:         { biomass: 625,    alloy: 500,    ore: 750,    population: 3 },
  bulwarkGuard:        { biomass: 400,    alloy: 600,    ore: 500,    population: 2 },
  disruptorUnit:       { biomass: 550,    alloy: 750,    ore: 650,    population: 2 },
  interceptorBike:     { biomass: 750,    alloy: 600,    ore: 900,    population: 3 },
  voidStalker:         { biomass: 900,    alloy: 700,    ore: 1100,   population: 3 },
  siegeMech:           { biomass: 1250,   alloy: 1000,   ore: 2000,   population: 4 },
  plasmaTurret:        { biomass: 1500,   alloy: 1200,   ore: 2500,   population: 2 },
  annihilatorPlatform: { biomass: 2000,   alloy: 1750,   ore: 3000,   population: 5 },
  overseer:            { biomass: 180000, alloy: 140000, ore: 120000, population: 5 },
};

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('[trim-overcap-queues] DATABASE_URL not set, skipping');
  process.exit(0);
}

const APPLY = process.env.DRY_RUN !== '1';
const client = new pg.Client({ connectionString: url });

try {
  await client.connect();

  const tableCheck = await client.query("SELECT to_regclass('public.\"Nexus\"') AS t");
  if (!tableCheck.rows[0]?.t) {
    console.log('[trim-overcap-queues] Nexus table not present yet, skipping');
    process.exit(0);
  }

  const { rows: nexuses } = await client.query(
    `SELECT id, "ownerId", "populationCurrent", "populationMax",
            biomass, alloy, ore, "trainingQueue"
       FROM "Nexus"
      WHERE "populationCurrent" > "populationMax"
        AND jsonb_array_length(COALESCE("trainingQueue", '[]'::jsonb)) > 0`,
  );

  console.log(
    `[trim-overcap-queues] mode=${APPLY ? 'APPLY' : 'DRY-RUN'} candidates=${nexuses.length}`,
  );

  let trimmedNexuses = 0;
  let trimmedEntries = 0;
  let unitsCancelled = 0;

  for (const nexus of nexuses) {
    const queue = Array.isArray(nexus.trainingQueue) ? [...nexus.trainingQueue] : [];
    if (queue.length === 0) continue;

    let overage = nexus.populationCurrent - nexus.populationMax;
    if (overage <= 0) continue;

    let refundBiomass = 0;
    let refundAlloy = 0;
    let refundOre = 0;
    let refundPop = 0;
    let removed = 0;
    let unitsHere = 0;

    // Trim from the end: most recently queued first. Player keeps progress on
    // anything mid-training that they've already waited on.
    while (overage > 0 && queue.length > 0) {
      const entry = queue[queue.length - 1];
      const cost = TROOP_COSTS[entry?.troopType];
      const amount = Number(entry?.amount) || 0;
      if (!cost || amount <= 0) {
        // Unknown troop type or malformed entry — drop without refund so we
        // don't accidentally credit resources from a corrupt row.
        queue.pop();
        removed += 1;
        continue;
      }

      const entryPop = cost.population * amount;
      // If removing this whole entry would overshoot the overage, we still
      // remove the whole entry — partial trims would require splitting the
      // completesAt timeline and the player ends up with a cleaner queue.
      // The "extra" population refunded just gives them headroom to retrain.
      refundBiomass += cost.biomass * amount;
      refundAlloy   += cost.alloy   * amount;
      refundOre     += cost.ore     * amount;
      refundPop     += entryPop;
      overage       -= entryPop;
      unitsHere     += amount;
      queue.pop();
      removed += 1;
    }

    if (removed === 0) continue;

    const newPop = Math.max(0, nexus.populationCurrent - refundPop);
    const newBiomass = nexus.biomass + refundBiomass;
    const newAlloy   = nexus.alloy   + refundAlloy;
    const newOre     = nexus.ore     + refundOre;

    console.log(
      `  nexus=${nexus.id} owner=${nexus.ownerId} removed=${removed} units=${unitsHere} ` +
      `pop=${nexus.populationCurrent}/${nexus.populationMax} -> ${newPop}/${nexus.populationMax} ` +
      `refund(b/a/o)=${refundBiomass}/${refundAlloy}/${refundOre}`,
    );

    trimmedNexuses += 1;
    trimmedEntries += removed;
    unitsCancelled += unitsHere;

    if (APPLY) {
      await client.query(
        `UPDATE "Nexus"
            SET "trainingQueue"     = $1::jsonb,
                "populationCurrent" = $2,
                biomass             = $3,
                alloy               = $4,
                ore                 = $5
          WHERE id = $6`,
        [JSON.stringify(queue), newPop, newBiomass, newAlloy, newOre, nexus.id],
      );
    }
  }

  console.log(
    `[trim-overcap-queues] done nexuses=${trimmedNexuses} entries=${trimmedEntries} ` +
    `units=${unitsCancelled} ${APPLY ? '(committed)' : '(dry-run — unset DRY_RUN to commit)'}`,
  );
} catch (err) {
  console.error('[trim-overcap-queues] error:', err.message);
  // Do not block deploy on cleanup failure — the cap is enforced going forward
  // by the controller, and a second pass next deploy will catch anything missed.
  process.exit(0);
} finally {
  await client.end().catch(() => {});
}
