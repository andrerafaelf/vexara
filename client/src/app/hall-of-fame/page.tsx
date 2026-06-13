'use client';

import GameLayout from '@/components/GameLayout';
import HallOfFameView from '@/components/HallOfFameView';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function HallOfFamePage() {
	const router = useRouter();

	useEffect(() => {
		if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
			router.push('/login');
		}
	}, []);

	return (
		<GameLayout activePage="hall-of-fame">
			<HallOfFameView />
		</GameLayout>
	);
}
