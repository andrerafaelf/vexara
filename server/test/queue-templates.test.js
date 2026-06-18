import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/vexara_test';

const prisma = (await import('../lib/prisma.js')).default;
const { saveQueueTemplate, listQueueTemplates, deleteQueueTemplate } = await import(
	'../services/queueTemplateService.js'
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

test('saveQueueTemplate rejects an empty name', async () => {
	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: '   ',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Name must be/);
});

test('saveQueueTemplate rejects a name over the length limit', async () => {
	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: 'x'.repeat(41),
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Name must be/);
});

test('saveQueueTemplate rejects an invalid troop type', async () => {
	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: 'My Preset',
		troopType: 'notATroop',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Invalid troop type/);
});

test('saveQueueTemplate rejects amount outside 1-1000', async () => {
	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: 'My Preset',
		troopType: 'assaultTrooper',
		amount: 1001
	});
	assert.equal(result.ok, false);
	assert.match(result.error, /Amount must be/);
});

test('saveQueueTemplate rejects once MAX_QUEUE_TEMPLATES_PER_USER is reached', async (t) => {
	withPatched(t, prisma.queueTemplate, { count: async () => 30 });

	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: 'My Preset',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, false);
	assert.equal(result.status, 409);
	assert.match(result.error, /Limit of 30/);
});

test('saveQueueTemplate creates a template when valid', async (t) => {
	const calls = {};
	withPatched(t, prisma.queueTemplate, {
		count: async () => 0,
		create: async (args) => {
			calls.create = args;
			return { id: 1, ...args.data, createdAt: new Date() };
		}
	});

	const result = await saveQueueTemplate({
		userId: 1,
		galaxyId: 1,
		name: '  My Preset  ',
		troopType: 'assaultTrooper',
		amount: 10
	});
	assert.equal(result.ok, true);
	assert.equal(calls.create.data.name, 'My Preset');
	assert.equal(calls.create.data.troopType, 'assaultTrooper');
	assert.equal(calls.create.data.amount, 10);
});

test('listQueueTemplates scopes to userId and galaxyId', async (t) => {
	const calls = {};
	withPatched(t, prisma.queueTemplate, {
		findMany: async (args) => {
			calls.findMany = args;
			return [];
		}
	});

	await listQueueTemplates(1, 2);
	assert.deepEqual(calls.findMany.where, { userId: 1, galaxyId: 2 });
});

test('deleteQueueTemplate only deletes rows owned by the caller', async (t) => {
	const calls = {};
	withPatched(t, prisma.queueTemplate, {
		deleteMany: async (args) => {
			calls.deleteMany = args;
			return { count: 1 };
		}
	});

	const ok = await deleteQueueTemplate(5, 1);
	assert.equal(ok, true);
	assert.deepEqual(calls.deleteMany.where, { id: 5, userId: 1 });
});

test('deleteQueueTemplate returns false when no row matched', async (t) => {
	withPatched(t, prisma.queueTemplate, { deleteMany: async () => ({ count: 0 }) });

	const ok = await deleteQueueTemplate(5, 1);
	assert.equal(ok, false);
});
