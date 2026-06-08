'use client';

import { useMemo, useState } from 'react';
import { liveResources, fmtAmount, fmtRate, type LiveResources } from './resourceUtils';
import ResourceIcon from './ResourceIcon';
import type { Nexus } from '../types/game';
import type { SendResourcesPrefill } from './SendResourcesModal';
import '../styles/Logistics.css';

type ResKind = 'biomass' | 'alloy' | 'ore';
const RES_KINDS: ResKind[] = ['biomass', 'alloy', 'ore'];

// Fill-ratio thresholds for the deficit/surplus coloring. A base sitting near
// empty is a candidate to receive; one near full is a candidate to send from.
const DEFICIT_RATIO = 0.25;
const SURPLUS_RATIO = 0.9;

interface Props {
	nexuses: Nexus[];
	// Open the Send modal pre-filled (e.g. source = the clicked row, smart top-up).
	onSend: (prefill: SendResourcesPrefill) => void;
}

function fillClass(ratio: number): string {
	if (ratio <= DEFICIT_RATIO) return 'log-cell--deficit';
	if (ratio >= SURPLUS_RATIO) return 'log-cell--surplus';
	return '';
}

export default function DashboardLogistics({ nexuses, onSend }: Props) {
	const [open, setOpen] = useState(false);
	const [now] = useState(() => Date.now());

	const rows = useMemo(
		() =>
			nexuses.map((n) => ({ nexus: n, live: liveResources(n, now) as LiveResources })),
		[nexuses, now]
	);

	// Only meaningful with more than one nexus — there's nowhere to send otherwise.
	if (nexuses.length <= 1) return null;

	return (
		<div className="cc-card log-card">
			<button
				type="button"
				className="log-header"
				onClick={() => setOpen((v) => !v)}
				aria-expanded={open}
			>
				<h3 className="cc-card-title log-title">Logistics</h3>
				<span className="log-header-right">
					<span className="log-hint">
						{nexuses.length} nexuses · send resources where they&apos;re short
					</span>
					<span className="log-chevron">{open ? '▲' : '▼'}</span>
				</span>
			</button>

			{open && (
				<div className="log-body">
					<div className="log-toolbar">
						<button
							type="button"
							className="log-send-all-btn"
							onClick={() => onSend({})}
						>
							Send Resources
						</button>
					</div>

					<div className="log-table-wrap">
						<table className="log-table">
							<thead>
								<tr>
									<th className="log-th-name">Nexus</th>
									<th>
										<ResourceIcon kind="biomass" size={13} /> Biomass
									</th>
									<th>
										<ResourceIcon kind="alloy" size={13} /> Alloy
									</th>
									<th>
										<ResourceIcon kind="ore" size={13} /> Ore
									</th>
									<th className="log-th-action" aria-label="Send" />
								</tr>
							</thead>
							<tbody>
								{rows.map(({ nexus, live }) => (
									<tr key={nexus._id}>
										<td className="log-name-cell">
											<span className="log-name">{nexus.name}</span>
											<span className="log-coords">
												({nexus.x}|{nexus.y})
											</span>
										</td>
										{RES_KINDS.map((res) => {
											const val = live[res];
											const ratio = live.cap > 0 ? val / live.cap : 0;
											return (
												<td key={res} className={`log-cell ${fillClass(ratio)}`}>
													<span className="log-amount">
														{fmtAmount(val)}
														<span className="log-cap">/{fmtAmount(live.cap)}</span>
													</span>
													<span className="log-bar-wrap">
														<span
															className="log-bar"
															style={{ width: `${Math.min(100, ratio * 100)}%` }}
														/>
													</span>
													<span className="log-rate">{fmtRate(live.prod[res])}</span>
												</td>
											);
										})}
										<td className="log-action-cell">
											<button
												type="button"
												className="log-row-send-btn"
												onClick={() =>
													onSend({ fromNexusId: nexus._id, suggest: 'topup' })
												}
												title={`Send resources from ${nexus.name}`}
											>
												Send
											</button>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>

					<p className="log-legend">
						<span className="log-legend-dot log-legend-dot--surplus" /> near full ·{' '}
						<span className="log-legend-dot log-legend-dot--deficit" /> running low
					</p>
				</div>
			)}
		</div>
	);
}
