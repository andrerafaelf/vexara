'use client';

import React, { useEffect, useRef, useState } from 'react';
import { getFactionLeaderboard, getMyFaction } from '../services/api';
import '../styles/DominanceBar.css';

interface FactionRow {
  id: number;
  name: string;
  tag: string;
  pct: number;
  isDominating: boolean;
  dominancePct: number;
  nexusCount: number;
  totalOwnedNexuses: number;
}

interface LeaderboardData {
  rows: FactionRow[];
  totalOwnedNexuses: number;
  dominanceThresholdPct: number;
}

const POLL_INTERVAL = 60_000;
const TOP_N = 4;

const DominanceBar: React.FC = () => {
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [inFaction, setInFaction] = useState(false);
  const [myFactionId, setMyFactionId] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let alive = true;

    const checkFaction = async () => {
      try {
        const res = await getMyFaction();
        if (!alive) return;
        if (res.data?.id) {
          setInFaction(true);
          setMyFactionId(res.data.id);
        } else {
          setInFaction(false);
        }
      } catch {
        setInFaction(false);
      }
    };

    const fetchData = async () => {
      try {
        const res = await getFactionLeaderboard();
        if (alive) setData(res.data);
      } catch {
        // silently ignore — bar just stays hidden
      }
    };

    checkFaction();
    fetchData();

    const interval = setInterval(fetchData, POLL_INTERVAL);
    return () => {
      alive = false;
      clearInterval(interval);
    };
  }, []);

  if (!inFaction || !data || data.rows.length === 0) return null;

  const top = data.rows.slice(0, TOP_N);
  const threshold = data.dominanceThresholdPct;
  const dominator = top.find((f) => f.isDominating);

  return (
    <div className="dom-bar" role="status" aria-label="Galaxy dominance">
      <div className="dom-bar-inner">
        <span className="dom-bar-label">Galaxy Control</span>

        <div className="dom-bar-factions">
          {top.map((faction) => {
            const isMe = faction.id === myFactionId;
            const isDom = faction.isDominating;

            return (
              <div
                key={faction.id}
                className={`dom-faction ${isMe ? 'dom-faction--mine' : ''} ${isDom ? 'dom-faction--dominating' : ''}`}
                title={`${faction.name} — ${faction.pct}% (${faction.nexusCount}/${faction.totalOwnedNexuses} nexuses)`}
              >
                <span className="dom-faction-tag">[{faction.tag}]</span>
                <div className="dom-faction-bar-wrap">
                  {/* threshold marker */}
                  <div
                    className="dom-threshold-marker"
                    style={{ left: `${threshold}%` }}
                    title={`Dominance threshold: ${threshold}%`}
                  />
                  <div
                    className={`dom-faction-bar-fill ${isDom ? 'dom-faction-bar-fill--dominating' : ''}`}
                    style={{ width: `${Math.min(faction.pct, 100)}%` }}
                  />
                </div>
                <span className="dom-faction-pct">{faction.pct}%</span>

                {isDom && faction.dominancePct > 0 && (
                  <div
                    className="dom-sustain-track"
                    title={`Holding ${Math.round(faction.dominancePct)}% of the 36h sustain window`}
                  >
                    <div className="dom-sustain-fill" style={{ width: `${faction.dominancePct}%` }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {dominator && (
          <span className="dom-bar-alert" aria-live="polite">
            <span className="dom-bar-alert-dot" />
            {dominator.tag} dominating
          </span>
        )}
      </div>
    </div>
  );
};

export default DominanceBar;
