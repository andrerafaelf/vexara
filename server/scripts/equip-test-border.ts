import 'dotenv/config';
import prisma from '../lib/prisma.js';

await prisma.user.update({
	where: { username: 'testcommander' },
	data: { avatarBorder: 'border_frame_1' },
});

console.log('✓ Equipped border_frame_1 on testcommander');
await prisma.$disconnect();
