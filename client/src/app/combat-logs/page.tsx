'use client';

import GameLayout from '@/components/GameLayout';
import PageSkeleton from '@/components/PageSkeleton';
import Reports from '@/components/Reports';
import { usePageReady } from '@/components/NavigationProgress';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { useAuth } from '@/context/AuthContext';
import { getMyFaction } from '@/services/api';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function CombatLogsPage() {
	const { selectedNexus } = useMyNexuses();
	const { refresh: refreshUnreadReports } = useUnreadReports();
	const { user } = useAuth();
	const router = useRouter();
	const [factionId, setFactionId] = useState<number | undefined>();

	usePageReady(!!selectedNexus, 'combat-logs');

	useEffect(() => {
		if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
			router.push('/login');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		getMyFaction()
			.then((res) => {
				const id = res.data?.faction?.id;
				if (id) setFactionId(id);
			})
			.catch(() => {});
	}, []);

	const currentUserId = user?.id ? parseInt(user.id, 10) : undefined;

	return (
		<GameLayout activePage="combat-logs">
			{selectedNexus ? (
				<Reports
					nexus={selectedNexus}
					onReadStateChange={refreshUnreadReports}
					factionId={factionId}
					currentUserId={currentUserId}
				/>
			) : (
				<PageSkeleton variant="rows" count={5} />
			)}
		</GameLayout>
	);
}
