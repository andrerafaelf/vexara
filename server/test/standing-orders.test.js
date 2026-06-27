import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const { createStandingOrder, triggerStandingOrders } = await import(
	'../services/standingOrderService.js'
);

function withPatched(t, target, patches) {
	const originals = {};
	for (const key of Object.keys(patches)) {
		originals[key] = target[key];
		target[key] = patches[key];
	}
	t.after(() => {
		for (const key of Object.keys(originals)) target[key] = originals[key];
	});
}

test('createStandingOrder rejects when protected and source nexus are the same', async () => {
	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 5,
		troops: { assaultTrooper: 10 }
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /must be different/);
});

test('createStandingOrder rejects an empty troop payload', async () => {
	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 6,
		troops: {}
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /at least one troop/);
});

test('createStandingOrder rejects non-stationable troop types (overseer)', async () => {
	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 6,
		troops: { overseer: 1 }
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Overseers/);
});

test('createStandingOrder rejects when the caller does not own the protected nexus', async (t) => {
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 5) return { id: 5, ownerId: 999, galaxyId: 1 };
			return { id: 6, ownerId: 1, galaxyId: 1 };
		}
	});
	withPatched(t, prisma.standingOrder, { count: async () => 0 });

	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 6,
		troops: { assaultTrooper: 10 }
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
});

test('createStandingOrder rejects once MAX_STANDING_ORDERS_PER_USER is reached', async (t) => {
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => ({ id: where.id, ownerId: 1, galaxyId: 1 })
	});
	withPatched(t, prisma.standingOrder, { count: async () => 20 });

	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 6,
		troops: { assaultTrooper: 10 }
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 409);
	assert.match(result.error, /Limit of 20/);
});

test('createStandingOrder upserts on the protected+source pair when authorized', async (t) => {
	const calls = {};
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => ({ id: where.id, ownerId: 1, galaxyId: 1 })
	});
	withPatched(t, prisma.standingOrder, {
		count: async () => 0,
		upsert: async (args) => {
			calls.upsert = args;
			return { id: 1, ...args.create };
		}
	});

	const result = await createStandingOrder({
		userId: 1,
		galaxyId: 1,
		protectedNexusId: 5,
		sourceNexusId: 6,
		troops: { assaultTrooper: 10 }
	});
	assert.equal(result.ok, true);
	assert.deepEqual(calls.upsert.where, {
		protectedNexusId_sourceNexusId: { protectedNexusId: 5, sourceNexusId: 6 }
	});
	assert.equal(calls.upsert.create.isActive, true);
});

test('triggerStandingOrders skips orders still inside the cooldown window', async (t) => {
	const calls = { updateManyCount: 0 };
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: new Date() // just triggered — inside cooldown
			}
		],
		updateMany: async () => {
			calls.updateManyCount += 1;
			return { count: 1 };
		}
	});

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	assert.equal(calls.updateManyCount, 0, 'should not claim/fire an order still in cooldown');
});

test('triggerStandingOrders fires eligible orders via troop transfer and stamps lastTriggeredAt', async (t) => {
	const calls = {};
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: null
			}
		],
		updateMany: async (args) => {
			calls.updateMany = args;
			return { count: 1 };
		}
	});
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 6) {
				return { id: 6, ownerId: 1, galaxyId: 1, x: 0, y: 0, assaultTrooper: 50 };
			}
			return { id: 5, ownerId: 1, galaxyId: 1, x: 1, y: 1, name: 'Protected Nexus' };
		}
	});
	withPatched(t, prisma, {
		$transaction: async (ops) => {
			calls.transactionOps = ops;
			return [{ id: 6 }, { id: 777, ownerNexusId: 6, hostNexusId: 5 }];
		}
	});

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	assert.ok(calls.updateMany, 'expected the order to be claimed via updateMany');
	assert.equal(calls.updateMany.where.id, 1);
	assert.ok(calls.updateMany.data.lastTriggeredAt instanceof Date);
	assert.ok(calls.transactionOps, 'expected sendTroopsTransaction to run a $transaction');
});

test('triggerStandingOrders skips firing when the source reserve is depleted', async (t) => {
	const calls = { transactionCalled: false };
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: null
			}
		],
		updateMany: async () => ({ count: 1 })
	});
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 6) return { id: 6, ownerId: 1, galaxyId: 1, x: 0, y: 0, assaultTrooper: 0 };
			return { id: 5, ownerId: 1, galaxyId: 1, x: 1, y: 1, name: 'Protected Nexus' };
		}
	});
	withPatched(t, prisma, { $transaction: async () => (calls.transactionCalled = true) });

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	assert.equal(calls.transactionCalled, false, 'should not attempt a transfer with zero troops available');
});

test('triggerStandingOrders skips when ownership of either nexus has changed', async (t) => {
	const calls = { transactionCalled: false };
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: null
			}
		],
		updateMany: async () => ({ count: 1 })
	});
	withPatched(t, prisma.nexus, {
		findUnique: async ({ where }) => {
			if (where.id === 6) return { id: 6, ownerId: 1, galaxyId: 1, x: 0, y: 0, assaultTrooper: 50 };
			// protected nexus was conquered by someone else
			return { id: 5, ownerId: 999, galaxyId: 1, x: 1, y: 1, name: 'Protected Nexus' };
		}
	});
	withPatched(t, prisma, { $transaction: async () => (calls.transactionCalled = true) });

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	assert.equal(calls.transactionCalled, false, 'should not transfer troops once ownership changed');
});

// Capture the troops a fired order actually sends. sendTroopsTransaction now uses
// the callback form of $transaction (prisma.$transaction(async (tx) => {...})).
// The mock detects callback vs array form and, for the callback form, supplies a
// fake tx object with the minimal methods sendTroopsTransaction needs:
//   tx.nexus.updateMany      - returns { count: 1 } (guard always passes in tests)
//   tx.nexus.findUniqueOrThrow - proxies through to calls.nexusPatch.findUnique
//   tx.troopTransfer.create  - captures args.data.troops in calls.sentTroops
function capturingTransfer(t, calls) {
	withPatched(t, prisma.nexus, calls.nexusPatch);
	withPatched(t, prisma, {
		$transaction: async (opsOrFn) => {
			if (typeof opsOrFn === 'function') {
				// Callback form used by sendTroopsTransaction
				const tx = {
					nexus: {
						updateMany: async () => ({ count: 1 }),
						findUniqueOrThrow: async ({ where }) => {
							const found = await calls.nexusPatch.findUnique({ where });
							if (!found) throw new Error(`Nexus ${where.id} not found in test mock`);
							return found;
						}
					},
					troopTransfer: {
						create: async (args) => {
							calls.sentTroops = args.data.troops;
							return {
								id: 777,
								ownerNexusId: args.data.ownerNexusId,
								hostNexusId: args.data.hostNexusId,
								ownerNexus: { id: args.data.ownerNexusId, name: 'Source', x: 0, y: 0 },
								hostNexus: { id: args.data.hostNexusId, name: 'Target', x: 1, y: 1 }
							};
						}
					}
				};
				return opsOrFn(tx);
			}
			// Array form (legacy path)
			return Promise.all(opsOrFn);
		}
	});
}

test('garrison floor: a fired order leaves the source self-defense reserve intact', async (t) => {
	// Source holds 14 stationable units, floor is 10 → at most 4 may leave even
	// though the order requests 10. This is the anti-bait guarantee: a triggered
	// order can never strip the source below the floor.
	const calls = {
		nexusPatch: {
			findUnique: async ({ where }) => {
				if (where.id === 6) return { id: 6, ownerId: 1, galaxyId: 1, x: 0, y: 0, assaultTrooper: 14 };
				return { id: 5, ownerId: 1, galaxyId: 1, x: 1, y: 1, name: 'Protected Nexus' };
			},
			update: async (args) => ({ id: args.where.id })
		}
	};
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: null
			}
		],
		updateMany: async () => ({ count: 1 })
	});
	capturingTransfer(t, calls);

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	const sentTotal = Object.values(calls.sentTroops ?? {}).reduce((a, b) => a + b, 0);
	assert.equal(sentTotal, 4, 'should send only the surplus above the floor (14 - 10), not the requested 10');
});

test('garrison floor: a source already at/below the floor sends nothing', async (t) => {
	const calls = {
		transactionCalled: false,
		nexusPatch: {
			findUnique: async ({ where }) => {
				// Exactly at the floor (10) → zero surplus → nothing leaves.
				if (where.id === 6) return { id: 6, ownerId: 1, galaxyId: 1, x: 0, y: 0, assaultTrooper: 10 };
				return { id: 5, ownerId: 1, galaxyId: 1, x: 1, y: 1, name: 'Protected Nexus' };
			}
		}
	};
	withPatched(t, prisma.standingOrder, {
		findMany: async () => [
			{
				id: 1,
				userId: 1,
				sourceNexusId: 6,
				protectedNexusId: 5,
				troops: { assaultTrooper: 10 },
				isActive: true,
				lastTriggeredAt: null
			}
		],
		updateMany: async () => ({ count: 1 })
	});
	withPatched(t, prisma.nexus, calls.nexusPatch);
	withPatched(t, prisma, { $transaction: async () => (calls.transactionCalled = true) });

	await triggerStandingOrders({ defenderUserId: 1, defenderNexusId: 5, galaxyId: 1 });
	assert.equal(calls.transactionCalled, false, 'a source at the floor must not transfer any troops');
});
