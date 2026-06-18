import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const { createAutoRequeueRule, attemptAutoRequeue } = await import(
	'../services/autoRequeueService.js'
);
// sendPushToUser (utils/push.ts) no-ops without VAPID keys, which the test
// env doesn't set — so it's exercised for real (not mocked) below; we assert
// on the rule's DB update instead of the push call itself, since push.js's
// named exports are frozen ESM bindings that can't be monkey-patched.

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

test('createAutoRequeueRule rejects an invalid kind', async () => {
	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'bogus'
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 400);
});

test('createAutoRequeueRule rejects training rules with an invalid troop type', async () => {
	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'not_a_real_troop',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Invalid troop type/);
});

test('createAutoRequeueRule rejects training rules with a bad amount', async () => {
	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'assaultTrooper',
		amount: 0
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Amount must be/);
});

test('createAutoRequeueRule rejects building rules with an invalid building', async () => {
	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'building',
		building: 'not_a_building'
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Invalid building/);
});

test('createAutoRequeueRule rejects when the caller does not own the nexus', async (t) => {
	withPatched(t, prisma.nexus, {
		findUnique: async () => ({ id: 5, ownerId: 999, galaxyId: 1 })
	});
	withPatched(t, prisma.autoRequeueRule, { count: async () => 0 });

	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 403);
});

test('createAutoRequeueRule rejects once MAX_AUTO_REQUEUE_RULES_PER_USER is reached', async (t) => {
	withPatched(t, prisma.nexus, { findUnique: async () => ({ id: 5, ownerId: 1, galaxyId: 1 }) });
	withPatched(t, prisma.autoRequeueRule, { count: async () => 30 });

	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 409);
	assert.match(result.error, /Limit of 30/);
});

test('createAutoRequeueRule creates a training rule when authorized', async (t) => {
	const calls = {};
	withPatched(t, prisma.nexus, { findUnique: async () => ({ id: 5, ownerId: 1, galaxyId: 1 }) });
	withPatched(t, prisma.autoRequeueRule, {
		count: async () => 0,
		create: async (args) => {
			calls.create = args;
			return { id: 1, ...args.data };
		}
	});

	const result = await createAutoRequeueRule({
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, true);
	assert.equal(calls.create.data.kind, 'training');
	assert.equal(calls.create.data.troopType, 'assaultTrooper');
	assert.equal(calls.create.data.amount, 10);
	assert.equal(calls.create.data.building, null);
});

test('attemptAutoRequeue skips when ownership of the nexus has changed', async (t) => {
	const calls = { updateCalled: false };
	withPatched(t, prisma.nexus, {
		findUnique: async () => ({ id: 5, ownerId: 999, galaxyId: 1 })
	});
	withPatched(t, prisma.autoRequeueRule, {
		update: async (args) => {
			calls.updateCalled = true;
			return args;
		}
	});

	await attemptAutoRequeue({
		id: 1,
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'assaultTrooper',
		amount: 10,
		building: null
	});
	assert.equal(calls.updateCalled, false, 'should not touch the rule once ownership changed');
});

// vanguardBreaker trains from Hangar Bay (TROOP_TRAINING_BUILDING), so a
// nexus with hangarBay: 0 fails attemptTrainTroops's building-gate check
// deterministically, with zero extra DB mocks needed.
test('attemptAutoRequeue self-pauses on a training validation failure', async (t) => {
	const calls = {};
	withPatched(t, prisma.nexus, {
		findUnique: async () => ({
			id: 5,
			ownerId: 1,
			galaxyId: 1,
			name: 'Home Base',
			hangarBay: 0,
			buildQueue: [],
			trainingQueue: []
		}),
		update: async ({ data }) => ({ id: 5, ownerId: 1, galaxyId: 1, name: 'Home Base', ...data })
	});
	withPatched(t, prisma.autoRequeueRule, {
		update: async (args) => {
			calls.update = args;
			return args;
		}
	});

	await attemptAutoRequeue({
		id: 1,
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'training',
		troopType: 'vanguardBreaker',
		amount: 10,
		building: null
	});

	assert.ok(calls.update, 'expected the rule to be updated on failure');
	assert.equal(calls.update.data.isActive, false);
	assert.match(calls.update.data.pausedReason, /Hangar Bay required/);
});

// armorFoundry requires commandCore level 2 (BUILDING_RULES), so a fresh
// nexus (commandCore: 0) fails attemptUpgradeBuilding's requirements-gate
// deterministically, with zero extra DB mocks needed.
test('attemptAutoRequeue self-pauses on a building validation failure', async (t) => {
	const calls = {};
	withPatched(t, prisma.nexus, {
		findUnique: async () => ({
			id: 5,
			ownerId: 1,
			galaxyId: 1,
			name: 'Home Base',
			commandCore: 0,
			armorFoundry: 0,
			buildQueue: [],
			trainingQueue: []
		}),
		update: async ({ data }) => ({ id: 5, ownerId: 1, galaxyId: 1, name: 'Home Base', ...data })
	});
	withPatched(t, prisma.autoRequeueRule, {
		update: async (args) => {
			calls.update = args;
			return args;
		}
	});

	await attemptAutoRequeue({
		id: 7,
		userId: 1,
		galaxyId: 1,
		nexusId: 5,
		kind: 'building',
		troopType: null,
		amount: null,
		building: 'armorFoundry'
	});

	assert.ok(calls.update, 'expected the rule to be updated on failure');
	assert.equal(calls.update.data.isActive, false);
	assert.match(calls.update.data.pausedReason, /Requirements not met/);
});

test('attemptAutoRequeue never throws even if the nexus lookup itself fails', async (t) => {
	withPatched(t, prisma.nexus, {
		findUnique: async () => {
			throw new Error('db connection lost');
		}
	});

	await assert.doesNotReject(() =>
		attemptAutoRequeue({
			id: 1,
			userId: 1,
			galaxyId: 1,
			nexusId: 5,
			kind: 'training',
			troopType: 'assaultTrooper',
			amount: 10,
			building: null
		})
	);
});
