'use client';

import React, { useEffect, useState } from 'react';
import { getFactionEvents } from '../services/api';

interface FactionEvent {
  id: number;
  type: string;
  actorName?: string;
  targetName?: string;
  meta?: string;
  createdAt: string;
}

interface Props {
  factionId: number;
}

const EVENT_LABELS: Record<string, (e: FactionEvent) => string> = {
  faction_created:       (e) => `${e.actorName ?? 'Someone'} founded the faction`,
  member_joined:         (e) => `${e.actorName ?? 'Someone'} joined the faction`,
  member_left:           (e) => `${e.actorName ?? 'Someone'} left the faction`,
  member_kicked:         (e) => `${e.targetName ?? 'Someone'} was kicked by ${e.actorName ?? 'an officer'}`,
  member_promoted:       (e) => `${e.targetName ?? 'Someone'} was promoted to Officer by ${e.actorName ?? 'the leader'}`,
  member_demoted:        (e) => `${e.targetName ?? 'Someone'} was demoted to Member by ${e.actorName ?? 'the leader'}`,
  nexus_captured:        (e) => `${e.actorName ?? 'Someone'} captured ${e.meta ?? 'a nexus'}`,
  war_declared:          (e) => `War declared on ${e.targetName ?? 'a faction'}`,
  war_declared_received: (e) => `${e.actorName ?? 'A faction'} declared war on us`,
  war_accepted:          (e) => `War with ${e.targetName ?? 'a faction'} is now active`,
  war_ended:             (e) => `War with ${e.targetName ?? e.actorName ?? 'a faction'} ended`,
  ceasefire_proposed:    (e) => `Ceasefire proposed to ${e.targetName ?? 'enemy faction'}`,
  ceasefire_received:    (e) => `${e.actorName ?? 'Enemy faction'} proposed a ceasefire`,
  ceasefire_declined:    (e) => `Ceasefire with ${e.targetName ?? e.actorName ?? 'a faction'} was declined`,
  leader_transferred:    (e) => `${e.actorName ?? 'The leader'} transferred leadership to ${e.targetName ?? 'a member'}`,
};

const EVENT_ICONS: Record<string, string> = {
  faction_created:       '*',
  member_joined:         '+',
  member_left:           '-',
  member_kicked:         'x',
  member_promoted:       '^',
  member_demoted:        'v',
  nexus_captured:        '!',
  war_declared:          'W',
  war_declared_received: 'W',
  war_accepted:          'W',
  war_ended:             '-',
  ceasefire_proposed:    'C',
  ceasefire_received:    'C',
  ceasefire_declined:    'C',
  leader_transferred:    '>',
};

const EVENT_COLORS: Record<string, string> = {
  faction_created:       'event-icon--gold',
  member_joined:         'event-icon--green',
  member_left:           'event-icon--muted',
  member_kicked:         'event-icon--red',
  member_promoted:       'event-icon--cyan',
  member_demoted:        'event-icon--orange',
  nexus_captured:        'event-icon--gold',
  war_declared:          'event-icon--red',
  war_declared_received: 'event-icon--red',
  war_accepted:          'event-icon--red',
  war_ended:             'event-icon--green',
  ceasefire_proposed:    'event-icon--cyan',
  ceasefire_received:    'event-icon--cyan',
  ceasefire_declined:    'event-icon--orange',
  leader_transferred:    'event-icon--gold',
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function FactionActivity({ factionId }: Props) {
  const [events, setEvents] = useState<FactionEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const res = await getFactionEvents(factionId);
        const data: FactionEvent[] = res.data;
        setEvents(data);
        if (data.length < 50) setHasOlder(false);
      } catch {
        setError('Failed to load activity log');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [factionId]);

  const loadOlder = async () => {
    if (!hasOlder || loadingOlder || events.length === 0) return;
    setLoadingOlder(true);
    try {
      const res = await getFactionEvents(factionId, events[0].id);
      const older: FactionEvent[] = res.data;
      if (older.length < 50) setHasOlder(false);
      setEvents((prev) => [...older, ...prev]);
    } catch {
      setError('Failed to load older events');
    } finally {
      setLoadingOlder(false);
    }
  };

  if (loading) return null;

  return (
    <div className="faction-activity">
      {error && <div className="faction-activity-error">{error}</div>}

      {events.length === 0 ? (
        <div className="faction-activity-empty">No activity recorded yet.</div>
      ) : (
        <>
          <div className="faction-activity-list">
            {events.slice().reverse().map((event) => {
              const label = EVENT_LABELS[event.type]?.(event) ?? event.type.replace(/_/g, ' ');
              const icon = EVENT_ICONS[event.type] ?? '•';
              const colorClass = EVENT_COLORS[event.type] ?? 'event-icon--muted';
              return (
                <div key={event.id} className="faction-activity-row">
                  <span className={`faction-activity-icon ${colorClass}`}>{icon}</span>
                  <div className="faction-activity-body">
                    <span className="faction-activity-label">{label}</span>
                    {event.meta && <span className="faction-activity-meta">{event.meta}</span>}
                  </div>
                  <span className="faction-activity-time">{formatRelative(event.createdAt)}</span>
                </div>
              );
            })}
          </div>

          {hasOlder && (
            <button
              className="faction-activity-load-more"
              onClick={loadOlder}
              disabled={loadingOlder}
            >
              {loadingOlder ? 'Loading...' : 'Load older events'}
            </button>
          )}
        </>
      )}
    </div>
  );
}
