'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getFactionChat, markFactionChatRead, sendFactionMessage } from '../services/api';
import { useGameSocket } from '../hooks/useGameSocket';
import Username from './Username';

interface ChatMessage {
  id: number;
  content: string;
  createdAt: string;
  user: { id: number; username: string; isSupporter?: boolean; supporterTier?: string | null };
}

interface Props {
  factionId: number;
  currentUserId?: number;
}

// ── Combat log parsing ────────────────────────────────────────────────────────

interface ParsedCombatLog {
  outcome: string;         // 'VICTORY' | 'DEFEAT' | 'SCOUT REPORT'
  date: string;
  striker: string;
  defender: string;
  control?: string;
  nexusLife?: string;
  attackerForces: string;
  defenderForces: string;
  resourcesLeft?: string;
  resourcesPlundered?: string;
  buildingsDamaged?: string;
  raw: string;
}

function parseCombatLog(text: string): ParsedCombatLog | null {
  if (!text.startsWith('[ COMBAT LOG -')) return null;

  const lines = text.split('\n');

  const headerMatch = lines[0].match(/\[ COMBAT LOG - (.+?) \]/);
  if (!headerMatch) return null;
  const outcome = headerMatch[1];

  const get = (prefix: string) => {
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? line.slice(prefix.length).trim() : '';
  };

  const getSection = (header: string): string => {
    const start = lines.findIndex((l) => l.trim() === header);
    if (start === -1) return '';
    const end = lines.findIndex((l, i) => i > start && l.startsWith('[') && l.trim().endsWith(']'));
    const sectionLines = (end === -1 ? lines.slice(start + 1) : lines.slice(start + 1, end))
      .map((l) => l.replace(/^  /, ''))
      .filter((l) => l && l !== '--------------------------------');
    return sectionLines.join('\n');
  };

  return {
    outcome,
    date: get('Date:'),
    striker: get('Striker:'),
    defender: get('Defender:'),
    control: get('Control:') || undefined,
    nexusLife: get('Nexus Life:') || undefined,
    attackerForces: getSection('[ ATTACKER FORCES ]'),
    defenderForces: getSection('[ DEFENDER FORCES LEFT ]'),
    resourcesLeft: getSection('[ RESOURCES LEFT ON DEFENDER NEXUS ]') || undefined,
    resourcesPlundered: getSection('[ RESOURCES PLUNDERED ]') || undefined,
    buildingsDamaged: getSection('[ BUILDINGS DAMAGED ]') || undefined,
    raw: text,
  };
}

// ── Combat log modal ──────────────────────────────────────────────────────────

function CombatLogModal({ log, onClose }: { log: ParsedCombatLog; onClose: () => void }) {
  const isVictory = log.outcome === 'VICTORY';
  const isDefeat = log.outcome === 'DEFEAT';
  const isScout = log.outcome === 'SCOUT REPORT';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const content = (
    <div
      className="clm-backdrop"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Combat Report"
    >
      <div className="clm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="clm-header">
          <h2 className="clm-title">{isScout ? 'Scout Report' : 'Combat Report'}</h2>
          <button className="clm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="clm-body">
          {!isScout && (
            <div className={`clm-result${isVictory ? ' clm-result--victory' : isDefeat ? ' clm-result--defeat' : ''}`}>
              {log.outcome}
            </div>
          )}

          <div className="clm-section clm-section--meta">
            <div className="clm-row"><span className="clm-label">Date</span><span className="clm-value">{log.date}</span></div>
            <div className="clm-row"><span className="clm-label">Striker</span><span className="clm-value">{log.striker}</span></div>
            <div className="clm-row"><span className="clm-label">Defender</span><span className="clm-value">{log.defender}</span></div>
            {log.control && <div className="clm-row"><span className="clm-label">Control</span><span className="clm-value">{log.control}</span></div>}
            {log.nexusLife && <div className="clm-row"><span className="clm-label">Nexus Life</span><span className="clm-value">{log.nexusLife}</span></div>}
          </div>

          {log.attackerForces && (
            <div className="clm-section">
              <h3 className="clm-section-title">Attacker Forces</h3>
              <pre className="clm-pre">{log.attackerForces}</pre>
            </div>
          )}

          {log.defenderForces && (
            <div className="clm-section">
              <h3 className="clm-section-title">Defender Forces Left</h3>
              <pre className="clm-pre">{log.defenderForces}</pre>
            </div>
          )}

          {log.resourcesPlundered && (
            <div className="clm-section clm-section--loot">
              <h3 className="clm-section-title">Resources Plundered</h3>
              <pre className="clm-pre clm-pre--loot">{log.resourcesPlundered}</pre>
            </div>
          )}

          {log.resourcesLeft && (
            <div className="clm-section">
              <h3 className="clm-section-title">Resources Left on Defender Nexus</h3>
              <pre className="clm-pre">{log.resourcesLeft}</pre>
            </div>
          )}

          {log.buildingsDamaged && (
            <div className="clm-section clm-section--damage">
              <h3 className="clm-section-title">Buildings Damaged</h3>
              <pre className="clm-pre clm-pre--damage">{log.buildingsDamaged}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

// ── Combat log chat card ──────────────────────────────────────────────────────

function CombatLogCard({ log }: { log: ParsedCombatLog }) {
  const [open, setOpen] = useState(false);
  const isVictory = log.outcome === 'VICTORY';
  const isDefeat = log.outcome === 'DEFEAT';
  const isScout = log.outcome === 'SCOUT REPORT';

  return (
    <>
      <button
        type="button"
        className={`clm-card${isVictory ? ' clm-card--victory' : isDefeat ? ' clm-card--defeat' : ' clm-card--scout'}`}
        onClick={() => setOpen(true)}
        title="Click to view full combat report"
      >
        <div className="clm-card-header">
          <span className="clm-card-outcome">{isScout ? '🔍 Scout Report' : isVictory ? '⚔ Victory' : '💀 Defeat'}</span>
          <span className="clm-card-hint">View report →</span>
        </div>
        <div className="clm-card-meta">
          <span className="clm-card-striker">{log.striker}</span>
          <span className="clm-card-vs">vs</span>
          <span className="clm-card-defender">{log.defender}</span>
        </div>
        {log.resourcesPlundered && (
          <div className="clm-card-loot">{log.resourcesPlundered.replace(/\n/g, '  ')}</div>
        )}
      </button>
      {open && <CombatLogModal log={log} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function FactionChat({ factionId, currentUserId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasOlder, setHasOlder] = useState(true);
  const [error, setError] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const latestIdRef = useRef<number>(0);
  const isFirstLoad = useRef(true);
  const markReadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleMarkRead = useCallback((messageId: number) => {
    if (!messageId) return;
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
    markReadTimerRef.current = setTimeout(() => {
      void markFactionChatRead(factionId, messageId).catch(() => {});
    }, 500);
  }, [factionId]);

  useEffect(() => () => {
    if (markReadTimerRef.current) clearTimeout(markReadTimerRef.current);
  }, []);

  const fetchInitial = useCallback(async () => {
    try {
      const res = await getFactionChat(factionId);
      const data: ChatMessage[] = res.data;
      setMessages(data);
      if (data.length > 0) latestIdRef.current = data[data.length - 1].id;
      if (data.length < 50) setHasOlder(false);
    } catch {
      setError('Failed to load chat');
    }
  }, [factionId]);

  useEffect(() => {
    fetchInitial();
  }, [fetchInitial]);

  useEffect(() => {
    if (isFirstLoad.current && messages.length > 0) {
      bottomRef.current?.scrollIntoView({ behavior: 'instant' });
      isFirstLoad.current = false;
    }
  }, [messages]);

  const appendMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => {
      if (prev.some((m) => m.id === msg.id)) return prev;
      const next = [...prev, msg];
      if (msg.id > latestIdRef.current) latestIdRef.current = msg.id;
      return next;
    });
    scheduleMarkRead(msg.id);
    const list = listRef.current;
    if (list) {
      const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 120;
      if (nearBottom) setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, []);

  useGameSocket({ onFactionChat: appendMessage });

  const loadOlder = async () => {
    if (!hasOlder || loadingOlder || messages.length === 0) return;
    setLoadingOlder(true);
    const oldestId = messages[0].id;
    const list = listRef.current;
    const prevScrollHeight = list?.scrollHeight ?? 0;
    try {
      const res = await getFactionChat(factionId, oldestId);
      const older: ChatMessage[] = res.data;
      if (older.length < 50) setHasOlder(false);
      setMessages((prev) => [...older, ...prev]);
      requestAnimationFrame(() => {
        if (list) list.scrollTop = list.scrollHeight - prevScrollHeight;
      });
    } catch {
      setError('Failed to load older messages');
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = draft.trim();
    if (!trimmed || sending) return;
    setSending(true);
    setError('');
    try {
      const res = await sendFactionMessage(factionId, trimmed);
      const msg: ChatMessage = res.data;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return existingIds.has(msg.id) ? prev : [...prev, msg];
      });
      latestIdRef.current = msg.id;
      scheduleMarkRead(msg.id);
      setDraft('');
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setError((err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return 'Today';
    if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const grouped: { date: string; messages: ChatMessage[] }[] = [];
  for (const msg of messages) {
    const label = formatDate(msg.createdAt);
    if (!grouped.length || grouped[grouped.length - 1].date !== label) {
      grouped.push({ date: label, messages: [msg] });
    } else {
      grouped[grouped.length - 1].messages.push(msg);
    }
  }

  return (
    <div className="faction-chat">
      <div className="faction-chat-messages" ref={listRef}>
        {hasOlder && (
          <button
            className="faction-chat-load-older"
            onClick={loadOlder}
            disabled={loadingOlder}
          >
            {loadingOlder ? 'Loading...' : 'Load older messages'}
          </button>
        )}

        {messages.length === 0 && !hasOlder && (
          <div className="faction-chat-empty">No messages yet. Say something!</div>
        )}

        {grouped.map((group) => (
          <div key={group.date}>
            <div className="faction-chat-date-divider">
              <span>{group.date}</span>
            </div>
            {group.messages.map((msg, i) => {
              const isMine = msg.user.id === currentUserId;
              const prev = group.messages[i - 1];
              const showAuthor = !prev || prev.user.id !== msg.user.id;
              const combatLog = parseCombatLog(msg.content);
              return (
                <div key={msg.id} className={`faction-chat-msg${isMine ? ' faction-chat-msg--mine' : ''}`}>
                  {showAuthor && (
                    <div className="faction-chat-author">
                      <Username
                        name={msg.user.username}
                        isSupporter={msg.user.isSupporter}
                        supporterTier={msg.user.supporterTier as any}
                        className="faction-chat-username"
                      />
                      <span className="faction-chat-time">{formatTime(msg.createdAt)}</span>
                    </div>
                  )}
                  {combatLog ? (
                    <CombatLogCard log={combatLog} />
                  ) : (
                    <div className="faction-chat-bubble">{msg.content}</div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {error && <div className="faction-chat-error">{error}</div>}

      <form className="faction-chat-form" onSubmit={handleSend}>
        <textarea
          className="faction-chat-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message… (Enter to send, Shift+Enter for newline)"
          rows={2}
          maxLength={4000}
          disabled={sending}
        />
        <button
          type="submit"
          className="faction-chat-send"
          disabled={sending || !draft.trim()}
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}
