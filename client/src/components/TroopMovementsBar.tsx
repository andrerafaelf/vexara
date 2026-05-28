'use client';

import { getAllAttacks } from '@/services/api';
import { Countdown } from './Countdown';
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
  defenderUsername?: string;
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
  const outgoing = data?.outgoing ?? [];

  if (incoming.length === 0 && outgoing.length === 0) return null;

  const goToNexus = (nexusId: number) => {
    startProgress();
    startTransition(() => router.push(`/nexus/${nexusId}`));
  };

  const goToStarfield = (x: number, y: number) => {
    startProgress();
    startTransition(() => router.push(`/starfield?cx=${x}&cy=${y}`));
  };

  return (
    <div className="troop-movements-bar" role="status" aria-label="Active troop movements">
      {incoming.map((attack) => (
        <button
          key={`in-${attack._id}`}
          type="button"
          className="tmb-item tmb-item--incoming"
          onClick={() => goToNexus(attack.defenderNexusId)}
          title={`Incoming attack on ${attack.defenderNexus?.name ?? 'your nexus'} — click to view`}
        >
          <span className="tmb-pulse" aria-hidden="true" />
          <span className="tmb-icon" aria-hidden="true">⚠</span>
          <span className="tmb-label">
            <span className="tmb-verb">INCOMING</span>
            {attack.attackerUsername && (
              <span className="tmb-who"> from <strong>{attack.attackerUsername}</strong></span>
            )}
            {attack.defenderNexus && (
              <span className="tmb-target"> → {attack.defenderNexus.name}</span>
            )}
          </span>
          <span className="tmb-countdown">
            <Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" />
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
      ))}
      {outgoing.map((attack) => {
        const isReturning = attack.status === 'returning';
        const verb = isReturning ? 'RETURNING' : attack.type === 'support' ? 'SUPPORT' : attack.type === 'scout' ? 'SCOUT' : 'OUTGOING';
        return (
          <button
            key={`out-${attack._id}`}
            type="button"
            className={`tmb-item tmb-item--outgoing${isReturning ? ' tmb-item--returning' : ''}`}
            onClick={() => goToNexus(attack.attackerNexusId)}
            title={`${isReturning ? 'Troops returning to' : `${verb} from`} ${attack.attackerNexus?.name ?? 'your nexus'} — click to view`}
          >
            <span className="tmb-icon" aria-hidden="true">{isReturning ? '↩' : '↗'}</span>
            <span className="tmb-label">
              <span className="tmb-verb">{verb}</span>
              {attack.attackerNexus && (
                <span className="tmb-target"> {isReturning ? '→' : 'from'} {attack.attackerNexus.name}</span>
              )}
              {!isReturning && attack.defenderNexus && (
                <span className="tmb-who"> → <strong>{attack.defenderNexus.name}</strong>{attack.defenderUsername ? ` (${attack.defenderUsername})` : ''}</span>
              )}
            </span>
            <span className="tmb-countdown">
              <Countdown endAt={attack.arrivesAt} completedLabel="Arriving…" />
            </span>
            {!isReturning && attack.defenderNexus && (
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
