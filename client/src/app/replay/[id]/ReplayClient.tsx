'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

interface ReplayPayload {
	id: string;
	attacker: {
		username: string | null;
		nexusName: string | null;
		x: number | null;
		y: number | null;
	};
	defender: {
		username: string | null;
		nexusName: string | null;
		x: number | null;
		y: number | null;
	};
	attackerInitial: Record<string, number>;
	defenderInitial: Record<string, number>;
	attackerLosses: Record<string, number>;
	defenderLosses: Record<string, number>;
	attackerPower: number | null;
	defenderPower: number | null;
	victory: boolean;
	conquered: boolean;
	resourcesStolen: { biomass: number; alloy: number; ore: number };
	combatSeed: number;
	createdAt: string;
}

function buildReplayTitle(data: ReplayPayload, attacker: string, defender: string) {
	const totalAttackers = Object.values(data.attackerInitial).reduce((a, b) => a + b, 0);
	if (data.conquered) return `${attacker} flips ${defender}'s nexus in Vexara`;
	if (data.victory)
		return `${attacker} breaks ${defender} in a ${totalAttackers}-unit Vexara strike`;
	return `${defender} holds against ${totalAttackers} attackers in Vexara`;
}

export default function ReplayClient({ data }: { data: ReplayPayload }) {
	const [copied, setCopied] = useState<string | null>(null);
	const attackerLabel = data.attacker.username || 'Unknown';
	const defenderLabel = data.defender.username || 'Unknown';

	const outcomeChip = data.conquered
		? { text: 'NEXUS CONQUERED', color: '#F85149' }
		: data.victory
			? { text: 'ATTACKER VICTORY', color: '#FF9E3D' }
			: { text: 'DEFENSE HELD', color: '#56D364' };

	const totalAttackers = Object.values(data.attackerInitial).reduce((a, b) => a + b, 0);
	const totalDefenders = Object.values(data.defenderInitial).reduce((a, b) => a + b, 0);
	const date = new Date(data.createdAt);
	const shareUrl =
		typeof window !== 'undefined' ? window.location.href : `https://vexara.world/replay/${data.id}`;
	const shareTitle = buildReplayTitle(data, attackerLabel, defenderLabel);
	const shareCopy = useMemo(
		() =>
			`${shareTitle}\n\n${totalAttackers.toLocaleString()} attackers vs ${totalDefenders.toLocaleString()} defenders. Watch the deterministic battle replay:\n${shareUrl}\n\nVexara is a free browser MMO RTS: no download, no account wipes, no pay-to-win.`,
		[shareTitle, totalAttackers, totalDefenders, shareUrl]
	);
	const xShareHref = `https://twitter.com/intent/tweet?text=${encodeURIComponent(
		`${shareTitle} - ${shareUrl}`
	)}`;

	async function copyShare(kind: string, text: string) {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(kind);
			window.setTimeout(() => setCopied(null), 1800);
		} catch {
			setCopied(null);
		}
	}

	return (
		<div className="public-replay-root">
			<header className="public-replay-header">
				<Link href="/" className="public-replay-brand" aria-label="Vexara home">
					<span className="public-replay-brand-mark">▲</span>
					<span className="public-replay-brand-name">VEXARA</span>
				</Link>
				<span
					className="public-replay-outcome-chip"
					style={{ background: outcomeChip.color, color: '#0D1117' }}
				>
					{outcomeChip.text}
				</span>
				<Link
					href="/register?utm_source=replay&utm_medium=share&utm_campaign=100_active"
					className="public-replay-cta"
				>
					Join the live galaxy
				</Link>
			</header>

			<main className="public-replay-main">
				<div className="public-replay-meta">
					<div className="public-replay-meta-row">
						<div className="public-replay-side public-replay-side--attacker">
							<span className="public-replay-side-label">ATTACKER</span>
							<span className="public-replay-side-name">{attackerLabel}</span>
							{data.attacker.nexusName && (
								<span className="public-replay-side-detail">
									{data.attacker.nexusName}
									{data.attacker.x != null && ` (${data.attacker.x}|${data.attacker.y})`}
								</span>
							)}
							<span className="public-replay-side-stat">
								{totalAttackers} units ·{' '}
								{data.attackerPower ? data.attackerPower.toLocaleString() : '.'} atk
							</span>
						</div>
						<span className="public-replay-vs">VS</span>
						<div className="public-replay-side public-replay-side--defender">
							<span className="public-replay-side-label">DEFENDER</span>
							<span className="public-replay-side-name">{defenderLabel}</span>
							{data.defender.nexusName && (
								<span className="public-replay-side-detail">
									{data.defender.nexusName}
									{data.defender.x != null && ` (${data.defender.x}|${data.defender.y})`}
								</span>
							)}
							<span className="public-replay-side-stat">
								{totalDefenders} units ·{' '}
								{data.defenderPower ? data.defenderPower.toLocaleString() : '.'} def
							</span>
						</div>
					</div>
				</div>

				<div className="public-replay-stage">
					<div style={{ textAlign: 'center', padding: '32px', color: '#6E7681', fontSize: '13px' }}>
						Detailed replay not available for this battle.
					</div>
				</div>

				<section className="public-replay-share" aria-labelledby="public-replay-share-title">
					<div>
						<span className="public-replay-share-kicker">Share asset</span>
						<h2 id="public-replay-share-title">{shareTitle}</h2>
						<p>
							Use this battle as a war story. Copy a ready-to-post version for Discord or Reddit, or
							publish the replay link directly.
						</p>
					</div>
					<div className="public-replay-share-actions">
						<button type="button" onClick={() => copyShare('Discord', shareCopy)}>
							{copied === 'Discord' ? 'Copied' : 'Copy Discord'}
						</button>
						<button type="button" onClick={() => copyShare('Reddit', shareCopy)}>
							{copied === 'Reddit' ? 'Copied' : 'Copy Reddit'}
						</button>
						<a href={xShareHref} target="_blank" rel="noopener noreferrer">
							Share on X
						</a>
						<button type="button" onClick={() => copyShare('Link', shareUrl)}>
							{copied === 'Link' ? 'Copied' : 'Copy link'}
						</button>
					</div>
				</section>

				<div className="public-replay-footer">
					<span>
						Battle ID #{data.id} · {date.toLocaleString()}
					</span>
					<span>Deterministic seed {data.combatSeed} · Same seed always replays identically</span>
				</div>
			</main>

			<style>{`
        body { margin: 0; }
        .public-replay-root {
          min-height: 100vh;
          background: linear-gradient(180deg, #0D1117 0%, #08090C 100%);
          color: #C9D1D9;
          font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
          display: flex;
          flex-direction: column;
        }
        .public-replay-header {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 14px 22px;
          border-bottom: 1px solid #1C232C;
          background: rgba(8,9,12,0.7);
          backdrop-filter: blur(8px);
        }
        .public-replay-brand {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: #F0F6FC;
          font-weight: 800;
          letter-spacing: 0.12em;
        }
        .public-replay-brand-mark {
          color: #FF9E3D;
          font-size: 20px;
        }
        .public-replay-brand-name { font-size: 14px; }
        .public-replay-outcome-chip {
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.08em;
          border-radius: 3px;
        }
        .public-replay-cta {
          margin-left: auto;
          color: #FF9E3D;
          text-decoration: none;
          font-weight: 700;
          font-size: 13px;
          border: 1px solid rgba(255,158,61,0.45);
          padding: 6px 12px;
          border-radius: 3px;
          transition: background 0.15s ease;
        }
        .public-replay-cta:hover {
          background: rgba(255,158,61,0.12);
        }
        .public-replay-main {
          max-width: 1100px;
          width: 100%;
          margin: 0 auto;
          padding: 24px 22px 40px;
          display: flex;
          flex-direction: column;
          gap: 18px;
          flex: 1;
        }
        .public-replay-meta {
          background: rgba(22,27,34,0.6);
          border: 1px solid #1C232C;
          border-radius: 8px;
          padding: 16px 20px;
        }
        .public-replay-meta-row {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          gap: 16px;
          align-items: center;
        }
        .public-replay-side {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        .public-replay-side--defender {
          align-items: flex-end;
          text-align: right;
        }
        .public-replay-side-label {
          font-size: 10px;
          letter-spacing: 0.12em;
          color: #6E7681;
          font-weight: 700;
        }
        .public-replay-side--attacker .public-replay-side-label { color: #FF9E3D; }
        .public-replay-side--defender .public-replay-side-label { color: #4A9EB0; }
        .public-replay-side-name {
          font-size: 22px;
          font-weight: 800;
          color: #F0F6FC;
          letter-spacing: 0.02em;
        }
        .public-replay-side-detail {
          font-size: 12px;
          color: #8B949E;
        }
        .public-replay-side-stat {
          font-size: 11px;
          color: #6E7681;
          font-variant-numeric: tabular-nums;
          margin-top: 2px;
        }
        .public-replay-vs {
          font-weight: 800;
          color: #444C56;
          letter-spacing: 0.16em;
          font-size: 14px;
        }
        .public-replay-stage { width: 100%; }
        .public-replay-share {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 18px;
          align-items: center;
          background: rgba(22,27,34,0.6);
          border: 1px solid #1C232C;
          border-left: 3px solid #FF9E3D;
          border-radius: 8px;
          padding: 18px 20px;
        }
        .public-replay-share-kicker {
          display: block;
          color: #FF9E3D;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }
        .public-replay-share h2 {
          margin: 0;
          color: #F0F6FC;
          font-size: 20px;
          line-height: 1.15;
        }
        .public-replay-share p {
          margin: 8px 0 0;
          color: #8B949E;
          font-size: 13px;
          line-height: 1.5;
          max-width: 62ch;
        }
        .public-replay-share-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 8px;
        }
        .public-replay-share-actions button,
        .public-replay-share-actions a {
          appearance: none;
          border: 1px solid rgba(255,158,61,0.45);
          background: rgba(255,158,61,0.08);
          color: #FFB15F;
          border-radius: 3px;
          padding: 8px 11px;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
          cursor: pointer;
        }
        .public-replay-share-actions button:hover,
        .public-replay-share-actions a:hover {
          background: rgba(255,158,61,0.16);
        }
        .public-replay-footer {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          font-size: 11px;
          color: #6E7681;
          font-variant-numeric: tabular-nums;
          padding-top: 8px;
          border-top: 1px solid #1C232C;
        }
        @media (max-width: 640px) {
          .public-replay-meta-row { grid-template-columns: 1fr; gap: 12px; }
          .public-replay-side--defender { align-items: flex-start; text-align: left; }
          .public-replay-vs { display: none; }
          .public-replay-side-name { font-size: 18px; }
          .public-replay-share { grid-template-columns: 1fr; }
          .public-replay-share-actions { justify-content: flex-start; }
        }
      `}</style>
		</div>
	);
}
