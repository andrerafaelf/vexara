'use client';

import React from 'react';
import './palette-preview.css';

type Theme = {
	id: string;
	name: string;
	blurb: string;
	className: string;
};

const THEMES: Theme[] = [
	{
		id: 'current',
		name: 'Current, Cyan-on-navy',
		blurb: 'Baseline. What you have today. Included for comparison.',
		className: 'pp-theme-current'
	},
	{
		id: 'industrial',
		name: 'Industrial military sci-fi',
		blurb:
			'Gunmetal + amber. Flat surfaces, sharp corners, mono numbers. Homeworld / FTL territory.',
		className: 'pp-theme-industrial'
	},
	{
		id: 'cold-space',
		name: 'Cold deep-space, desaturated',
		blurb:
			'Same teal family pulled down hard. No gradient text. No glows. Lowest-risk change from current.',
		className: 'pp-theme-cold'
	},
	{
		id: 'imperial',
		name: 'Imperial / faction-coded',
		blurb:
			'Blood red + bone white on near-black. Strong identity. Locks you into an authoritarian vibe.',
		className: 'pp-theme-imperial'
	}
];

export default function PalettePreviewPage() {
	return (
		<div className="pp-page">
			<header className="pp-header">
				<h1>Palette preview</h1>
				<p>
					The same components rendered in each candidate palette. Scroll through and pick one. The
					current palette is shown first as a baseline.
				</p>
			</header>

			<div className="pp-grid">
				{THEMES.map((t) => (
					<section key={t.id} className={`pp-theme ${t.className}`}>
						<header className="pp-theme-header">
							<h2>{t.name}</h2>
							<p>{t.blurb}</p>
						</header>
						<ThemeSample />
					</section>
				))}
			</div>
		</div>
	);
}

function ThemeSample() {
	return (
		<div className="pp-sample">
			{/* Hero */}
			<div className="pp-sample-hero">
				<h3 className="pp-hero-h">A persistent galaxy at war.</h3>
				<p className="pp-hero-sub">
					Browser-based 4X strategy. Build a nexus, train twelve unit types, and conquer real
					players one Overseer at a time.
				</p>
				<div className="pp-hero-row">
					<button className="pp-btn pp-btn-primary">Request alpha access</button>
					<button className="pp-btn pp-btn-ghost">Deep dive</button>
				</div>
			</div>

			{/* Card with numeric data, most "in-world" surface */}
			<div className="pp-card">
				<div className="pp-card-head">
					<span className="pp-card-label">NEXUS, ARGENT IV</span>
					<span className="pp-card-meta">Lv 04 · Sector 12-B</span>
				</div>
				<table className="pp-table">
					<tbody>
						<tr>
							<td>Biomass</td>
							<td className="pp-num">12,480</td>
							<td className="pp-num pp-pos">+612/hr</td>
						</tr>
						<tr>
							<td>Alloy</td>
							<td className="pp-num">8,201</td>
							<td className="pp-num pp-pos">+418/hr</td>
						</tr>
						<tr>
							<td>Ore</td>
							<td className="pp-num">5,940</td>
							<td className="pp-num pp-neg">−120/hr</td>
						</tr>
					</tbody>
				</table>
				<div className="pp-card-actions">
					<span className="pp-badge pp-badge-info">Build queue · 3/5</span>
					<span className="pp-badge pp-badge-warn">Storage 92%</span>
				</div>
			</div>

			{/* Alerts */}
			<div className="pp-alerts">
				<div className="pp-alert pp-alert-danger">
					<strong>Incoming raid</strong> · 4 fleets, ETA 00:12:43
				</div>
				<div className="pp-alert pp-alert-success">
					<strong>Conquest complete</strong> · Helix-7 control reached 0
				</div>
			</div>

			{/* Form */}
			<div className="pp-form">
				<label className="pp-field">
					<span className="pp-field-label">Email</span>
					<input type="email" placeholder="you@domain.com" defaultValue="commander@vexara.io" />
				</label>
			</div>
		</div>
	);
}
