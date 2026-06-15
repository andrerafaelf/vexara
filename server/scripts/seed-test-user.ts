import 'dotenv/config';
import prisma from '../lib/prisma.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { ALL_TITLES, ALL_BORDERS } from '../utils/shopCatalog.js';

const password = await bcrypt.hash('test1234', 10);
const referralCode = crypto.randomBytes(6).toString('hex');

// Every title available in the game (supporter + battle pass + all shop titles)
const ALL_EARNED_TITLES = [
	// Supporter titles
	'Recruit',
	'Officer',
	'Commander',
	// Battle pass titles
	'Operative',
	'Proven',
	'Vex Commander',
	'High Commander',
	'Season Conqueror',
	// All shop titles
	...ALL_TITLES.map((t) => t.name),
];

const user = await prisma.user.upsert({
	where: { username: 'testcommander' },
	update: {
		vexPoints: 20000,
		emailVerifiedAt: new Date(),
		earnedTitles: ALL_EARNED_TITLES,
	},
	create: {
		username: 'testcommander',
		email: 'testcommander@vexara.dev',
		password,
		referralCode,
		vexPoints: 20000,
		emailVerifiedAt: new Date(),
		isAlphaFounder: true,
		earnedTitles: ALL_EARNED_TITLES,
		activeTitle: 'Recruit',
	},
});

// Seed ShopPurchase rows for every shop title and border so they show as owned.
// Delete first so re-running is idempotent.
const allItems = [...ALL_TITLES, ...ALL_BORDERS];
const itemKeys = allItems.map((i) => i.key);

await prisma.shopPurchase.deleteMany({
	where: { userId: user.id, itemKey: { in: itemKeys } },
});

await prisma.shopPurchase.createMany({
	data: allItems.map((item) => ({
		userId: user.id,
		itemKey: item.key,
		itemType: item.type,
		vpSpent: 0,
	})),
});

console.log(`✓ User ready: id=${user.id}  username=${user.username}  vexPoints=${user.vexPoints}`);
console.log(`  Titles: ${ALL_EARNED_TITLES.length} total`);
console.log(`  Borders: ${ALL_BORDERS.length} total`);
console.log(`  Login: testcommander / test1234`);
await prisma.$disconnect();
