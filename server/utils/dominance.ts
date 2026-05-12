import prisma from '../lib/prisma.js';
import { NOTIF, sendPushToUser } from './push.js';

const DOMINANCE_THRESHOLD = 0.65;
const DOMINANCE_SUSTAIN_MS = 36 * 60 * 60 * 1000;

export async function processDominanceVictories(): Promise<void> {
  const activeGalaxies = await prisma.galaxy.findMany({
    where: { status: 'active' },
    select: { id: true, name: true },
  });

  for (const galaxy of activeGalaxies) {
    try {
      await processGalaxy(galaxy);
    } catch (err) {
      console.error(`processDominanceVictories failed for galaxy ${galaxy.id}:`, err);
    }
  }
}

async function processGalaxy(galaxy: { id: number; name: string }): Promise<void> {
  const ownerships = await prisma.nexus.groupBy({
    by: ['ownerId'],
    where: { galaxyId: galaxy.id, ownerId: { not: null } },
    _count: { _all: true },
  });

  const totalOwned = ownerships.reduce((sum, row) => sum + row._count._all, 0);
  if (totalOwned === 0) return;

  let leader: (typeof ownerships)[0] | null = null;
  for (const row of ownerships) {
    if (!leader || row._count._all > leader._count._all) leader = row;
  }
  if (!leader || leader.ownerId == null) return;

  const leaderShare = leader._count._all / totalOwned;

  if (leaderShare < DOMINANCE_THRESHOLD) {
    await prisma.galaxyPlayer.updateMany({
      where: { galaxyId: galaxy.id, dominanceSince: { not: null } },
      data: { dominanceSince: null },
    });
    return;
  }

  await prisma.galaxyPlayer.updateMany({
    where: { galaxyId: galaxy.id, userId: { not: leader.ownerId }, dominanceSince: { not: null } },
    data: { dominanceSince: null },
  });

  const leaderPlayer = await prisma.galaxyPlayer.findUnique({
    where: { userId_galaxyId: { userId: leader.ownerId, galaxyId: galaxy.id } },
    select: { id: true, dominanceSince: true },
  });
  if (!leaderPlayer) return;

  const now = new Date();
  if (!leaderPlayer.dominanceSince) {
    await prisma.galaxyPlayer.update({ where: { id: leaderPlayer.id }, data: { dominanceSince: now } });
    return;
  }

  const heldFor = now.getTime() - new Date(leaderPlayer.dominanceSince).getTime();
  if (heldFor < DOMINANCE_SUSTAIN_MS) return;

  await endGalaxy(galaxy, leader.ownerId);
}

async function endGalaxy(galaxy: { id: number; name: string }, winnerUserId: number): Promise<void> {
  await prisma.galaxy.update({
    where: { id: galaxy.id },
    data: { status: 'ended', endedAt: new Date(), winnerUserId },
  });

  const players = await prisma.galaxyPlayer.findMany({
    where: { galaxyId: galaxy.id },
    select: { userId: true },
  });

  for (const p of players) {
    const isWinner = p.userId === winnerUserId;
    void sendPushToUser(p.userId, isWinner ? NOTIF.ATTACK_RESOLVED : NOTIF.ATTACK_INCOMING, {
      title: isWinner ? '👑 Galaxy Conquered' : '🏁 Galaxy Ended',
      body: isWinner
        ? `You achieved dominance in ${galaxy.name}.`
        : `${galaxy.name} has ended. A dominant player has won.`,
      tag: `galaxy-ended-${galaxy.id}`,
      data: { url: '/' },
    });
  }

  await prisma.user.updateMany({
    where: { activeGalaxyId: galaxy.id },
    data: { activeGalaxyId: null },
  });
}
