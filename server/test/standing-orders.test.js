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
