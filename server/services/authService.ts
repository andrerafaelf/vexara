import prisma from '../lib/prisma.js';

export function findUserByUsername(username: string) {
	return prisma.user.findFirst({
		where: { username: { equals: username, mode: 'insensitive' } }
	});
}
