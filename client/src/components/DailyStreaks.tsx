'use client';

import { useCallback, useEffect, useState } from 'react';
import { claimDailyStreak, getDailyStreak } from '../services/api';
import { useToast } from '../context/ToastContext';
import { Gift, AlertTriangle } from 'lucide-react';
import '../styles/DailyStreaks.css';

interface DailyQuest {
  id: string;
  title: string;
  description: string;
  target: number;
  progress: number;
  completed: boolean;
  reward: { type: string; biomass: number; alloy: number; ore: number };
}

interface StreakData {
  currentStreak: number;
  longestStreak: number;
  streakMultiplier: number;
  streakAboutToExpire: boolean;
  claimed: boolean;
  quests: DailyQuest[];
}

export default function DailyStreaks() {
  const [data, setData] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const res = await getDailyStreak();
      setData(res.data);
    } catch {
      // non-critical
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const handleClaim = async () => {
    if (!data || claiming) return;
    setClaiming(true);
    try {
      const res = await claimDailyStreak();
      const result = res.data as any;
      if (result.success) {
        toast(`Daily streak ${result.streak}! +${result.reward.biomass} biomass, +${result.reward.alloy} alloy, +${result.reward.ore} ore at ${result.nexusName}`, 'success');
        await load();
      } else {
        toast(result.error || 'Failed to claim', 'error');
      }
    } catch (err: any) {
      toast(err?.response?.data?.error || 'Failed to claim rewards', 'error');
    } finally {
      setClaiming(false);
    }
  };

  if (loading || !data) return null;

  const allComplete = data.quests.every((q) => q.completed);

  return (
    <div className="daily-streaks">
      <div className="daily-streaks-fire-bg" />
      <div className="daily-streaks-header">
        <div className="daily-streaks-title-row">
          <h3 className="daily-streaks-title">Daily Quests</h3>
          {data.currentStreak > 0 && (
            <span className="daily-streaks-badge">{data.currentStreak} day streak</span>
          )}
        </div>
        {data.streakMultiplier > 1 && (
          <span className="daily-streaks-bonus">x{data.streakMultiplier.toFixed(1)} reward bonus</span>
        )}
      </div>

      {data.streakAboutToExpire && !data.claimed && (
        <div className="daily-streaks-warning">
          <AlertTriangle size={14} aria-hidden="true" />
          Complete your quests today to keep your {data.currentStreak}-day streak!
        </div>
      )}

      <div className="daily-streaks-quests">
        {data.quests.map((q) => (
          <div key={q.id} className={`daily-quest ${q.completed ? 'daily-quest--done' : ''}`}>
            <div className="daily-quest-info">
              <span className="daily-quest-title">{q.title}</span>
              <span className="daily-quest-desc">{q.description}</span>
            </div>
            <div className="daily-quest-right">
              <div className="daily-quest-progress">
                <div
                  className="daily-quest-progress-fill"
                  style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                />
              </div>
              <span className="daily-quest-count">{Math.min(q.progress, q.target)}/{q.target}</span>
            </div>
            <div className="daily-quest-reward">
              <span className="daily-quest-reward-amount">+{q.reward.biomass.toLocaleString()} Biomass</span>
              <span className="daily-quest-reward-amount">+{q.reward.alloy.toLocaleString()} Alloy</span>
              <span className="daily-quest-reward-amount">+{q.reward.ore.toLocaleString()} Ore</span>
            </div>
          </div>
        ))}
      </div>

      {!data.claimed && allComplete && (
        <button className="daily-streaks-claim" onClick={handleClaim} disabled={claiming}>
          <Gift size={14} aria-hidden="true" />
          {claiming ? 'Claiming…' : 'Claim All Rewards'}
        </button>
      )}

      {data.claimed && (
        <div className="daily-streaks-claimed">All rewards claimed for today. Come back tomorrow!</div>
      )}
    </div>
  );
}
