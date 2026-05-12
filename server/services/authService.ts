import prisma from '../lib/prisma.js';

export function findUserByUsername(username: string) {
  return prisma.user.findUnique({ where: { username } });
}
