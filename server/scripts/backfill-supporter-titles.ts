// Backfill cumulative supporter titles for all existing supporters.
// Runs inside the vx-server container where only dist/ is present.
// Import path points at the compiled output; tsx transpiles this file on the fly.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime inside the container (dist/ not present locally)
import prisma from '../dist/lib/prisma.js';

type SupporterTier = 'recruit' | 'officer' | 'vanguard' | 'commander';

const TIER_RANK: Record<SupporterTier, number> = { recruit: 1, officer: 2, vanguard: 3, commander: 4 };

const TIER_TITLES: Record<SupporterTier, string> = {
	recruit:   'Recruit',
	officer:   'Officer',
	vanguard:  'Vanguard',
	commander: 'Commander',
};

const supporters = await prisma.user.findMany({
	where: { isSupporter: true, supporterTier: { not: null } },
	select: { id: true, username: true, supporterTier: true, isFounder: true, earnedTitles: true },
});

console.log(`Found ${supporters.length} supporter(s).`);

let updated = 0;
for (const u of supporters) {
	const tier = u.supporterTier as SupporterTier;
	const earned = (u.earnedTitles as string[]) ?? [];

	const titlesToAdd: string[] = [];
	for (const [t, title] of Object.entries(TIER_TITLES) as [SupporterTier, string][]) {
		if (TIER_RANK[t] > TIER_RANK[tier]) continue;
		const grantTitle = t === 'commander' && u.isFounder ? 'Alpha Commander' : title;
		if (!earned.includes(grantTitle)) {
			titlesToAdd.push(grantTitle);
		}
	}

	if (titlesToAdd.length === 0) {
		console.log(`  ${u.username} (${tier}): already complete, skipping`);
		continue;
	}

	await prisma.user.update({
		where: { id: u.id },
		data: { earnedTitles: [...earned, ...titlesToAdd] as any },
	});
	console.log(`  ${u.username} (${tier}): added [${titlesToAdd.join(', ')}]`);
	updated++;
}

console.log(`Done. Updated ${updated} of ${supporters.length} supporter(s).`);
await prisma.$disconnect();
