import 'dotenv/config';
import prisma from '../lib/prisma.js';

const PRESET_KEYS = [
	'sentinelLancer',
	'assaultTrooper',
	'vanguardBreaker',
	'reconOperative',
	'wraithSkimmer',
	'siegeMech',
	'bulwarkGuard',
	'pyreSuppressor',
	'arcDisruptor',
	'phantomLance',
	'annihilatorPlatform',
	'voidStalker',
	'plasmaTurret',
	'overseer',
	'siegeColossus',
	'aegisSkirmisher',
];

function pick(userId: number): string {
	return `preset:${PRESET_KEYS[userId % PRESET_KEYS.length]}`;
}

const users = await prisma.user.findMany({
	where: { avatarKey: null },
	select: { id: true },
});

console.log(`Found ${users.length} users without an avatar.`);

let updated = 0;
for (const u of users) {
	await prisma.user.update({
		where: { id: u.id },
		data: { avatarKey: pick(u.id) },
	});
	updated++;
}

console.log(`Done. Assigned preset avatars to ${updated} users.`);
await prisma.$disconnect();
