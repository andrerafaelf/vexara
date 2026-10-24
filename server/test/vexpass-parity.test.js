import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import * as bp from '../utils/battlePass.js';

const { REWARD_TABLE } = bp;

// The client mirrors the server reward table (one copy drives both the in-game
// modal and the public landing page). This guards against the two drifting —
// which previously left the landing page advertising wrong levels and titles.
//
// We parse the client constant as text rather than importing it: it lives in a
// separate TS project (@/ path aliases, Next config) that the server's test
// runner can't resolve. The file is plain data, so a regex extract is reliable.
const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, '../../client/src/constants/vexPass.ts');
const src = readFileSync(clientPath, 'utf8');

function parseClientLevels(text) {
	const rowRe = /\{\s*level:\s*(\d+),\s*free:\s*(null|'[^']*'),\s*paid:\s*(null|'[^']*')\s*\}/g;
	const rows = [];
	let m;
	while ((m = rowRe.exec(text)) !== null) {
		const unquote = (v) => (v === 'null' ? null : v.slice(1, -1));
		rows.push({ level: Number(m[1]), free: unquote(m[2]), paid: unquote(m[3]) });
	}
	return rows;
}

test('client PASS_LEVELS matches server REWARD_TABLE exactly', () => {
	const clientLevels = parseClientLevels(src);

	assert.equal(
		clientLevels.length,
		REWARD_TABLE.length,
		`level count mismatch: client ${clientLevels.length} vs server ${REWARD_TABLE.length}`
	);

	for (let i = 0; i < REWARD_TABLE.length; i++) {
		const s = REWARD_TABLE[i];
		const c = clientLevels[i];
		assert.equal(c.level, s.level, `level mismatch at index ${i}`);
		assert.equal(c.free, s.free, `free reward mismatch at level ${s.level}`);
		assert.equal(c.paid, s.paid, `paid reward mismatch at level ${s.level}`);
	}
});

// ---------------------------------------------------------------------------
// Scalar constants. XP_PER_LEVEL drifted (client 300 vs server 200) and shipped
// to production once; every mirrored numeric/string constant is pinned here.
// ---------------------------------------------------------------------------

function clientConst(name) {
	const m = new RegExp(String.raw`export const ${name}\s*(?::[^=]+)?=\s*([^;]+);`).exec(src);
	assert.ok(m, `client/src/constants/vexPass.ts must export ${name}`);
	const raw = m[1].trim();
	return raw.startsWith("'") ? raw.slice(1, -1) : Number(raw);
}

// [client name, server value]
const SCALARS = [
	['XP_PER_LEVEL', bp.PASS_XP_PER_LEVEL],
	['MAX_PASS_LEVEL', bp.MAX_PASS_LEVEL],
	['PASS_COST_VP', bp.PASS_COST_VP],
	['PASS_CACHE_REWARD', bp.PASS_CACHE_REWARD],
	['PASS_CACHE_BANK_CAP', bp.PASS_CACHE_BANK_CAP],
	['PASS_DAILY_XP_CAP', bp.PASS_DAILY_XP_CAP],
	['PASS_PACING_BASE_LEVELS', bp.PASS_PACING_BASE_LEVELS],
	['PASS_PACING_LEVELS_PER_DAY', bp.PASS_PACING_LEVELS_PER_DAY],
	['PASS_CACHE_PACING_LEVEL', bp.PASS_CACHE_PACING_LEVEL],
	['PASS_CLAIM_WASTE_TOLERANCE', bp.PASS_CLAIM_WASTE_TOLERANCE]
];

for (const [name, serverValue] of SCALARS) {
	test(`client ${name} equals the server value (${serverValue})`, () => {
		assert.equal(clientConst(name), serverValue);
	});
}

test('XP_PER_LEVEL is 200 on both sides (the 300 vs 200 drift that shipped once)', () => {
	assert.equal(bp.PASS_XP_PER_LEVEL, 200);
	assert.equal(clientConst('XP_PER_LEVEL'), 200);
	assert.equal(bp.PASS_MAX_XP, bp.MAX_PASS_LEVEL * clientConst('XP_PER_LEVEL'));
});

test('client PASS_LEVELS covers exactly levels 1..50', () => {
	const levels = parseClientLevels(src).map((r) => r.level);
	assert.deepEqual(levels, Array.from({ length: 50 }, (_, i) => i + 1));
});

// Player-facing copy once advertised pass titles that do not exist in the
// permanent pass (Season Conqueror, Recruit as a paid-track title).
test('player-facing copy only names titles that exist in PASS_TITLE_RANK', () => {
	for (const rel of [
		'../../client/src/app/how-to-play/page.tsx',
		'../../client/src/components/Landing/LandingPage.tsx',
		'../../client/src/constants/titles.ts'
	]) {
		const page = readFileSync(resolve(here, rel), 'utf8');
		assert.ok(!page.includes('Season Conqueror'), `${rel} still names Season Conqueror`);
		assert.ok(!/paid-track titles Recruit/.test(page), `${rel} names Recruit as a paid-track title`);
	}
});
