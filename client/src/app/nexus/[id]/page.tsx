'use client';

import GameLayout from '@/components/GameLayout';
import NexusView from '@/components/NexusView';
import PageSkeleton from '@/components/PageSkeleton';
import QueuedPwaGuideModal from '@/components/QueuedPwaGuideModal';
import QueuedWhileYouWereAway from '@/components/QueuedWhileYouWereAway';
import { usePageReady } from '@/components/NavigationProgress';
import { useMyNexuses } from '@/hooks/useMyNexuses';
import { useUnreadReports } from '@/hooks/useUnreadReports';
import { createNexus, getNexus } from '@/services/api';
import '@/styles/Game.css';
import { Nexus } from '@/types/game';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const SELECTED_NEXUS_KEY = 'selectedNexusId';

type NexusTab = 'overview' | 'buildings' | 'troops' | 'deployed';

function parseTab(value: string | null): NexusTab {
	if (value === 'buildings' || value === 'troops' || value === 'deployed') return value;
	return 'overview';
}

export default function NexusPage() {
	const { refresh: refreshUnread } = useUnreadReports();
	const [creatingNexus, setCreatingNexus] = useState(false);
	const [nexusNameInput, setNexusNameInput] = useState('');
	const router = useRouter();
	const searchParams = useSearchParams();
	const params = useParams();
	const nexusId = params.id as string;
	const activeTab = parseTab(searchParams.get('tab'));

	const qc = useQueryClient();
	const {
		nexuses,
		isLoading: nexusesLoading,
		isFetching: nexusesFetching,
		hasResolved: nexusesResolved,
		refetch: refetchNexuses
	} = useMyNexuses();

	const {
		data: selectedNexusData,
		isFetching: nexusFetching,
		isSuccess: nexusSucceeded,
		error: nexusError,
		refetch: refetchSelectedNexus
	} = useQuery({
		queryKey: ['nexus', nexusId],
		queryFn: () => getNexus(nexusId).then((r) => r.data as Nexus),
		staleTime: 20 * 1000,
		refetchInterval: (query) => {
			if ((query.state.error as any)?.response?.status === 429) return false;
			const status = (query.state.error as any)?.response?.status;
			// A 403/404 on the active nexus means the player has lost it (conquest
			// wipes ownership). Stop polling so the eliminated screen can take over.
			if (status === 403 || status === 404) return false;
			return 30_000;
		},
		// Don't retry on 403/404 — those are terminal (ownership lost) and
		// retrying just delays the eliminated screen.
		retry: (failureCount, err: any) => {
			const status = err?.response?.status;
			if (status === 403 || status === 404) return false;
			return failureCount < 3;
		},
		enabled: !!nexusId && typeof window !== 'undefined' && !!localStorage.getItem('token'),
		// Seed from the nexuses list so NexusView renders immediately without a loading flash
		initialData: () => {
			const cached = qc.getQueryData<Nexus[]>(['myNexuses']);
			return cached?.find((n) => String(n._id) === nexusId);
		},
		initialDataUpdatedAt: () => qc.getQueryState(['myNexuses'])?.dataUpdatedAt
	});

	// Treat a 403/404 on the active nexus as "ownership lost" once the nexus
	// list has also resolved to zero. This is the path a freshly-conquered
	// player takes: their stored selectedNexusId still points to the old
	// nexus, so the page mounts, gets a 403, and would otherwise sit on a
	// skeleton forever waiting for nexusSucceeded.
	const nexusOwnershipLost =
		(nexusError as any)?.response?.status === 403 || (nexusError as any)?.response?.status === 404;

	const selectedNexus: Nexus | null = selectedNexusData ?? null;

	// Latch: once we've ever seen nexuses we know the user isn't eliminated, so never show that screen.
	const everHadNexus = useRef(false);
	if (nexuses.length > 0 || selectedNexus) everHadNexus.current = true;

	// Page is ready when we have a nexus to render, OR we've confirmed (via a real server response)
	// there are no nexuses. nexusesResolved guards the F5 race where the query is briefly idle
	// with no data, in that window pageReady must stay false to avoid an eliminated-screen flash.
	// Ownership-lost (403/404) on the active nexus also makes the page ready -
	// the eliminated screen renders below once myNexuses confirms zero owned.
	const pageReady =
		!!selectedNexus ||
		(nexusesResolved && nexuses.length === 0) ||
		(nexusOwnershipLost && nexusesResolved);
	usePageReady(pageReady, 'nexus');

	useEffect(() => {
		if (typeof window !== 'undefined' && !localStorage.getItem('token')) {
			router.push('/login');
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		if (nexuses.length > 0) {
			const routeNexusId = nexuses.find((n: Nexus) => String(n._id) === nexusId)?._id;
			const storedNexusId = localStorage.getItem(SELECTED_NEXUS_KEY);
			const storedValidNexusId = nexuses.find((n: Nexus) => n._id === storedNexusId)?._id;
			const fallbackNexusId = routeNexusId ?? storedValidNexusId ?? nexuses[0]._id;
			localStorage.setItem(SELECTED_NEXUS_KEY, fallbackNexusId);
			if (!routeNexusId) {
				router.replace(`/nexus/${fallbackNexusId}`);
			}
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nexuses.length, nexusId]);

	useEffect(() => {
		if (selectedNexusData) {
			localStorage.setItem(SELECTED_NEXUS_KEY, String(selectedNexusData._id));
		}
	}, [selectedNexusData]);

	// Clear the stale stored nexusId once we've confirmed ownership is lost so the
	// /play dispatcher and other entry points don't keep redirecting back here.
	useEffect(() => {
		if (nexusOwnershipLost && nexusesResolved && nexuses.length === 0) {
			localStorage.removeItem(SELECTED_NEXUS_KEY);
		}
	}, [nexusOwnershipLost, nexusesResolved, nexuses.length]);

	const handleSelectNexus = (nexus: Nexus) => {
		localStorage.setItem(SELECTED_NEXUS_KEY, String(nexus._id));
		router.push(`/nexus/${nexus._id}`);
	};

	const handleTabChange = (tab: NexusTab) => {
		const query = tab === 'overview' ? '' : `?tab=${tab}`;
		router.replace(`/nexus/${nexusId}${query}`, { scroll: false });
	};

	const handleUpdate = () => {
		refetchNexuses();
		refetchSelectedNexus();
		refreshUnread();
	};

	const handleCreateNexus = async () => {
		setCreatingNexus(true);
		try {
			const name = nexusNameInput.trim() || undefined;
			const result = await createNexus(name);
			const newNexus = result.data as Nexus;
			localStorage.setItem(SELECTED_NEXUS_KEY, String(newNexus._id));
			await refetchNexuses();
			router.replace(`/nexus/${newNexus._id}`);
		} catch {
			// leave creatingNexus=false so user can retry
		} finally {
			setCreatingNexus(false);
		}
	};

	// Hard gate: show eliminated screen after the myNexuses list resolves to zero AND
	// either the per-nexus query confirmed empty (new player path) OR returned 403/404
	// (just-conquered player whose stored selectedNexusId still points at a lost nexus).
	// The everHadNexus latch prevents flashing the create screen during the window between
	// myNexuses resolving and selectedNexus populating from initialData.
	const isEliminated =
		nexusesResolved &&
		nexuses.length === 0 &&
		!selectedNexus &&
		!everHadNexus.current &&
		((nexusSucceeded && !nexusFetching) || nexusOwnershipLost);

	return (
		<>
			<GameLayout
				activePage="dashboard"
				selectedNexusId={nexusId}
				onSelectNexus={handleSelectNexus}
			>
				<QueuedPwaGuideModal />
				<QueuedWhileYouWereAway />
				{selectedNexus ? (
					<NexusView
						nexus={selectedNexus}
						onUpdate={handleUpdate}
						initialTab={activeTab}
						onTabChange={handleTabChange}
					/>
				) : isEliminated ? (
					<div className="eliminated-screen">
						<div className="eliminated-card">
							<div className="eliminated-icon">💀</div>
							<h2 className="eliminated-title">Eliminated</h2>
							<p className="eliminated-subtitle">
								All your nexuses have been conquered. Rise from the ashes - your comeback starts
								now.
							</p>
							<ul className="eliminated-perks">
								<li>
									Lv12 resource buildings, CC Lv12 + RC Lv7 + Shield Grid Lv8 - hit the ground
									running
								</li>
								<li>
									100,000 of each resource and a 250-troop starter garrison (Trooper, Drone,
									Breaker, Recon, Suppressor, Bulwark)
								</li>
								<li>1.5 days of attack protection</li>
							</ul>
							<input
								className="eliminated-name-input"
								type="text"
								placeholder="Name your new nexus (optional)"
								value={nexusNameInput}
								onChange={(e) => setNexusNameInput(e.target.value)}
								maxLength={32}
								onKeyDown={(e) => {
									if (e.key === 'Enter') handleCreateNexus();
								}}
								disabled={creatingNexus}
							/>
							<button
								className="eliminated-create-btn"
								onClick={handleCreateNexus}
								disabled={creatingNexus}
								data-onboarding="create-nexus"
							>
								{creatingNexus ? 'Rebuilding...' : 'Rise Again'}
							</button>
						</div>
					</div>
				) : (
					<PageSkeleton variant="rows" count={6} />
				)}
			</GameLayout>
		</>
	);
}
