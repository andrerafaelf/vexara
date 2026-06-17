import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { REWARD_TABLE } from '../utils/battlePass.js';

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
