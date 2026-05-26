'use client';

import { Building2, Shield, Swords, Trophy, Users, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import '../styles/WhileYouWereAway.css';
import { getActivitySummary } from '../services/api';
import { serverNow } from '../realtime/serverClock';

const LAST_VISIT_KEY = 'wywa_last_visit';

interface AttackSummary {
  id: number;
  type: string;
  isMyAttack: boolean;
  attackerNexus?: string;
  defenderNexus?: string;
  result?: string;
  completedAt: string;
}

interface BuildingSummary {
  nexusName: string;
  building: string;
  level: number;
}

interface TroopSummary {
  nexusName: string;
  type: string;
  count: number;
}

interface ActivityData {
  attacks: AttackSummary[];
  buildings: BuildingSummary[];
  troops: TroopSummary[];
  since: string;
}

const BUILDING_LABELS: Record<string, string> = {
  commandCore: 'Command Core',
  recruitmentCore: 'Recruitment Core',
  lifeSupport: 'Life Support',
  storageVault: 'Storage Vault',
  biomassFarm: 'Biomass Farm',
  alloyForge: 'Alloy Forge',
  oreExtractor: 'Ore Extractor',
  shieldGrid: 'Shield Grid',
};

const TROOP_LABELS: Record<string, string> = {
  lancerDrone: 'Lancer Drone',
  assaultTrooper: 'Assault Trooper',
  breakerUnit: 'Breaker Unit',
  reconOperative: 'Recon Operative',
  skimmerBike: 'Skimmer Bike',
  siegeMech: 'Siege Mech',
  bulwarkGuard: 'Bulwark Guard',
  suppressorTeam: 'Suppressor Team',
  disruptorUnit: 'Disruptor Unit',
  interceptorBike: 'Interceptor Bike',
  annihilatorPlatform: 'Annihilator Platform',
  overseer: 'Overseer',
};

function formatDuration(since: string) {
  const ms = serverNow() - new Date(since).getTime();
  const h = Math.floor(ms / 3600000);
  const d = Math.floor(h / 24);
  if (d >= 2) return `${d} days`;
  if (h >= 1) return `${h}h`;
  return 'a few minutes';
}

function resultLabel(result: string | undefined, isMyAttack: boolean) {
  if (!result) return '';
  if (result === 'victory') return isMyAttack ? 'Victory' : 'Defeated';
  if (result === 'defeat') return isMyAttack ? 'Defeat' : 'Repelled';
  return result;
}

function resultClass(result: string | undefined, isMyAttack: boolean) {
  if (!result) return '';
  const win = (result === 'victory' && isMyAttack) || (result === 'defeat' && !isMyAttack);
  return win ? 'wywa-result--win' : 'wywa-result--loss';
}

interface Props {
  onDismiss: () => void;
}

export default function WhileYouWereAway({ onDismiss }: Props) {
  const [data, setData] = useState<ActivityData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const lastVisit = typeof window !== 'undefined' ? localStorage.getItem(LAST_VISIT_KEY) : null;
    getActivitySummary(lastVisit ?? undefined)
      .then((r: any) => setData(r.data as ActivityData))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  const handleDismiss = () => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LAST_VISIT_KEY, new Date().toISOString());
    }
    onDismiss();
  };

  if (loading) return null;
  if (!data) return null;

  const hasAnything = data.attacks.length > 0 || data.buildings.length > 0 || data.troops.length > 0;
  if (!hasAnything) {
    handleDismiss();
    return null;
  }

  const wins = data.attacks.filter((a) => {
    const w = (a.result === 'victory' && a.isMyAttack) || (a.result === 'defeat' && !a.isMyAttack);
    return w;
  }).length;
  const losses = data.attacks.length - wins;

  return (
    <div className="wywa-overlay" role="dialog" aria-modal="true" aria-label="Activity summary">
      <div className="wywa-modal">
        <div className="wywa-header">
          <div className="wywa-header-text">
            <span className="wywa-title">While You Were Away</span>
            <span className="wywa-subtitle">
              Last {formatDuration(data.since)} of activity
            </span>
          </div>
          <button className="wywa-close" onClick={handleDismiss} aria-label="Dismiss">
            <X size={18} />
          </button>
        </div>

        <div className="wywa-body">
          {data.attacks.length > 0 && (
            <section className="wywa-section">
              <div className="wywa-section-header">
                <Swords size={15} />
                <span>Combat ({data.attacks.length} battle{data.attacks.length !== 1 ? 's' : ''})</span>
                <span className="wywa-combat-tally">
                  {wins > 0 && <span className="wywa-tally--win"><Trophy size={12} /> {wins}</span>}
                  {losses > 0 && <span className="wywa-tally--loss"><Shield size={12} /> {losses}</span>}
                </span>
              </div>
              <ul className="wywa-list">
                {data.attacks.map((a) => (
                  <li key={a.id} className="wywa-attack-row">
                    <span className="wywa-attack-nexuses">
                      <strong>{a.attackerNexus ?? '?'}</strong>
                      <span className="wywa-arrow">→</span>
                      <strong>{a.defenderNexus ?? '?'}</strong>
                    </span>
                    {a.result && (
                      <span className={`wywa-result ${resultClass(a.result, a.isMyAttack)}`}>
                        {resultLabel(a.result, a.isMyAttack)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.buildings.length > 0 && (
            <section className="wywa-section">
              <div className="wywa-section-header">
                <Building2 size={15} />
                <span>Buildings completed ({data.buildings.length})</span>
              </div>
              <ul className="wywa-list">
                {data.buildings.map((b, i) => (
                  <li key={i} className="wywa-item-row">
                    <span className="wywa-item-label">{BUILDING_LABELS[b.building] ?? b.building}</span>
                    <span className="wywa-item-meta">{b.nexusName} &mdash; Lv {b.level}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {data.troops.length > 0 && (
            <section className="wywa-section">
              <div className="wywa-section-header">
                <Users size={15} />
                <span>Troops trained ({data.troops.reduce((s, t) => s + t.count, 0)})</span>
              </div>
              <ul className="wywa-list">
                {data.troops.map((t, i) => (
                  <li key={i} className="wywa-item-row">
                    <span className="wywa-item-label">{TROOP_LABELS[t.type] ?? t.type}</span>
                    <span className="wywa-item-meta">{t.nexusName} &mdash; +{t.count}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="wywa-footer">
          <button className="wywa-dismiss-btn" onClick={handleDismiss}>
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
