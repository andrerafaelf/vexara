'use client';

import { Globe2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getMyGalaxy } from '../services/api';
import GalaxyPicker, { Galaxy } from './GalaxyPicker';

interface Props {
	/** Called when the user picks a (new or existing) galaxy so the page can refresh data. */
	onGalaxyChanged?: (galaxy: Galaxy) => void;
}

export const MY_GALAXY_KEY = ['myGalaxy'] as const;

const GalaxyChip: React.FC<Props> = ({ onGalaxyChanged }) => {
	const [showPicker, setShowPicker] = useState(false);
	const [pickerForced, setPickerForced] = useState(false);

	const { data } = useQuery({
		queryKey: MY_GALAXY_KEY,
		queryFn: () => getMyGalaxy().then((r) => r.data),
		staleTime: 5 * 60_000
	});

	const activeGalaxy: Galaxy | null = data?.activeGalaxy ?? null;

	useEffect(() => {
		if (data !== undefined && !activeGalaxy) {
			setPickerForced(true);
			setShowPicker(true);
		}
	}, [data, activeGalaxy]);

	useEffect(() => {
		const handler = () => {
			setPickerForced(true);
			setShowPicker(true);
		};
		window.addEventListener('galaxy:needs-selection', handler);
		return () => window.removeEventListener('galaxy:needs-selection', handler);
	}, []);

	return (
		<>
			<button
				type="button"
				className={`galaxy-chip ${activeGalaxy?.status === 'ended' ? 'galaxy-chip-ended' : ''}`}
				onClick={() => {
					setPickerForced(false);
					setShowPicker(true);
				}}
				title="Switch galaxy"
			>
				<span className="galaxy-chip-icon" aria-hidden="true">
					<Globe2 size={14} />
				</span>
				<span className="galaxy-chip-name">{activeGalaxy?.name ?? 'Select galaxy'}</span>
				{activeGalaxy?.status === 'ended' && <span className="galaxy-chip-tag">ended</span>}
			</button>

			{showPicker && (
				<GalaxyPicker
					forced={pickerForced}
					onClose={() => setShowPicker(false)}
					onSelected={(g) => {
						setShowPicker(false);
						setPickerForced(false);
						onGalaxyChanged?.(g);
					}}
				/>
			)}
		</>
	);
};

export default GalaxyChip;
