import 'dotenv/config';
import prisma from '../lib/prisma.js';

// Grant "Alpha Commander" to every isFounder user who has "Commander" but not "Alpha Commander".
// These are users who paid commander-tier during alpha before the title name was added.

const founders = await prisma.user.findMany({
	where: { isFounder: true },
	select: { id: true, username: true, earnedTitles: true },
});

console.log(`Found ${founders.length} founder(s).`);

let updated = 0;
for (const u of founders) {
	const earned = (u.earnedTitles as string[]) ?? [];
	if (earned.includes('Alpha Commander')) {
		console.log(`  ${u.username}: already has Alpha Commander, skipping`);
		continue;
	}
	const next = earned.includes('Commander')
		? earned.map((t) => (t === 'Commander' ? 'Alpha Commander' : t))
		: [...earned, 'Alpha Commander'];
	await prisma.user.update({
		where: { id: u.id },
		data: { earnedTitles: next as any },
	});
	console.log(`  ${u.username}: granted Alpha Commander (was: ${earned.join(', ')})`);
	updated++;
}

console.log(`Done. Updated ${updated} user(s).`);
await prisma.$disconnect();
