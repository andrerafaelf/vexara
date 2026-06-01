'use client';

import { useCallback, useEffect, useState } from 'react';
import { useGameSocket, type NexusConqueredPayload } from '../hooks/useGameSocket';
import '../styles/ConqueredModal.css';

export default function ConqueredModal() {
	const [conquest, setConquest] = useState<NexusConqueredPayload | null>(null);

	const onNexusConquered = useCallback((payload: NexusConqueredPayload) => {
		setConquest(payload);
	}, []);

	useGameSocket({ onNexusConquered });

	if (!conquest) return null;

	return (
		<div className="conquered-modal-backdrop" onClick={() => setConquest(null)}>
			<div className="conquered-modal" onClick={(e) => e.stopPropagation()}>
				<div className="conquered-modal-icon">&#9760;</div>
				<h2 className="conquered-modal-title">Nexus Conquered</h2>
				<p className="conquered-modal-text">
					Your nexus <strong>{conquest.nexusName}</strong> has been conquered by{' '}
					<strong>{conquest.attackerName}</strong>.
				</p>
				<p className="conquered-modal-sub">
					The enemy has seized control of your nexus. All stationed troops have been lost. Check
					your combat logs for the full battle report.
				</p>
				<button className="conquered-modal-btn" onClick={() => setConquest(null)}>
					Understood
				</button>
			</div>
		</div>
	);
}
