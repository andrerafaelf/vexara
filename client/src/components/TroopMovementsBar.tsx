'use client';

import { getAllAttacks } from '@/services/api';
import { Countdown } from './Countdown';
import { formatTimeOfDay } from '@/utils/date';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';
import { useStartProgress } from './NavigationProgress';
import '@/styles/TroopMovementsBar.css';

interface Attack {
  _id: string;
  status: string;
  arrivesAt: string;
  attackerNexusId: number;
  defenderNexusId: number;
  attackerNexus?: { id: number; name: string; x: number; y: number } | null;
  defenderNexus?: { id: number; name: string; x: number; y: number } | null;
  attackerUsername?: string;
  type?: string;
}

export default function TroopMovementsBar() {
  const router = useRouter();
  const startProgress = useStartProgress();

  const { data } = useQuery<{ incoming: Attack[]; outgoing: Attack[] }>({
    queryKey: ['allAttacks'],
    queryFn: () => getAllAttacks().then((r) => r.data),
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  const incoming = data?.incoming ?? [];

  if (incoming.length === 0) return null;

  const goToNexus = (nexusId: number) => {
    startProgress();
    startTransition(() => router.push(`/nexus/${nexusId}`));
  };

  const goToStarfield = (x: number, y: number) => {
    startProgress();
    startTransition(() => router.push(`/starfield?cx=${x}&cy=${y}`));
  };

  return (
    <div className="troop-movements-bar" role="alert" aria-label="Incoming strikes">
      {incoming.map((attack) => {
        const isScout = attack.type === 'scout';
        return (
          <button
            key={`in-${attack._id}`}
            type="button"
            className={`tmb-item tmb-item--incoming${isScout ? ' tmb-item--scout' : ''}`}
            onClick={() => goToNexus(attack.defenderNexusId)}
            title={`${isScout ? 'Incoming scout' : 'Incoming attack'} on ${attack.defenderNexus?.name ?? 'your nexus'} — click to view nexus`}
          >
            <span className="tmb-pulse" aria-hidden="true" />
            <span className="tmb-icon" aria-hidden="true">{isScout ? '👁' : '⚠'}</span>
            <span className="tmb-label">
              <span className="tmb-verb">{isScout ? 'SCOUT' : 'INCOMING'}</span>
              {attack.attackerUsername && (
                <span className="tmb-who"> from <strong>{attack.attackerUsername}</strong></span>
              )}
              {attack.defenderNexus && (
                <span className="tmb-target"> → {attack.defenderNexus.name}</span>
              )}
            </span>
            <span className="tmb-countdown">
              <Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" />
              {' @ '}
              {formatTimeOfDay(attack.arrivesAt, true)}
            </span>
            {attack.defenderNexus && (
              <button
                type="button"
                className="tmb-map-btn"
                onClick={(e) => { e.stopPropagation(); goToStarfield(attack.defenderNexus!.x, attack.defenderNexus!.y); }}
                title="View on Starfield"
                aria-label="View on Starfield"
              >
                ⊕
              </button>
            )}
          </button>
        );
      })}
    </div>
  );
}
