import React, { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	createNexusGroup,
	deleteNexusGroup,
	getNexusGroups,
	renameNexusGroup,
	setGroupNexuses
} from '../services/api';

import { Check, Pencil, ScrollText, Settings, Trash2, X } from 'lucide-react';
import { Nexus, NexusGroup, User } from '../types/game';
import GalaxyChip from './GalaxyChip';
import NexusTypeBadge from './NexusTypeBadge';
import SupportTiersCard from './SupportTiersCard';
import Avatar from './Avatar';
import { CombatIcon, ConstructionIcon } from './VexaraIcons';

export const NEXUS_GROUPS_KEY = ['nexusGroups'] as const;

interface NexusSidebarProps {
	nexuses: Nexus[];
	selectedNexusId: string | null;
	onSelectNexus: (nexus: Nexus) => void;
	onGroupsChange?: (groups: NexusGroup[]) => void;
	unreadNexusIds?: Set<string>;
	user?: User | null;
}

const GEAR_THRESHOLD = 2;

const NexusSidebar: React.FC<NexusSidebarProps> = ({
	nexuses,
	selectedNexusId,
	onSelectNexus,
	onGroupsChange,
	unreadNexusIds,
	user
}) => {
	const qc = useQueryClient();
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [showGroupManager, setShowGroupManager] = useState(false);

	const { data: groups = [] } = useQuery<NexusGroup[]>({
		queryKey: NEXUS_GROUPS_KEY,
		queryFn: () => getNexusGroups().then((r) => r.data ?? []),
		staleTime: 60_000
	});

	useEffect(() => {
		onGroupsChange?.(groups);
	}, [groups, onGroupsChange]);

	const updateGroups = useCallback(
		(next: NexusGroup[]) => {
			qc.setQueryData(NEXUS_GROUPS_KEY, next);
			onGroupsChange?.(next);
		},
		[qc, onGroupsChange]
	);

	const visibleNexuses = (() => {
		return activeGroupId !== null
			? nexuses.filter((n) => groups.find((g) => g.id === activeGroupId)?.nexusIds.includes(n._id))
			: nexuses;
	})();

	const totalPoints = nexuses.reduce((sum, n) => sum + (n.points ?? 0), 0);

	return (
		<>
			<nav className="nexus-nav">
				<div className="nexus-nav-scroll">
					<GalaxyChip onGalaxyChanged={() => window.location.reload()} />
					<div className="nexus-nav-header">
						<h3>Your Nexuses</h3>
						{nexuses.length >= GEAR_THRESHOLD && (
							<button
								className="group-manage-btn"
								onClick={() => setShowGroupManager(true)}
								title="Manage groups"
								aria-label="Manage groups"
							>
								<Settings size={14} />
							</button>
						)}
					</div>

					{groups.length > 0 && (
						<div className="nexus-group-filter">
							<select
								className="nexus-group-select"
								value={activeGroupId ?? ''}
								onChange={(e) => setActiveGroupId(e.target.value || null)}
							>
								<option value="">All</option>
								{groups.map((g) => (
									<option key={g.id} value={g.id}>
										{g.name}
									</option>
								))}
							</select>
						</div>
					)}

					{visibleNexuses.map((nexus) => (
						<div
							key={nexus._id}
							className={`nexus-item ${String(nexus._id) === selectedNexusId ? 'active' : ''}`}
							onClick={() => onSelectNexus(nexus)}
						>
							<div className="nexus-name">
								<span className="nexus-name-text">{nexus.name}</span>
								<NexusTypeBadge type={nexus.nexusType} doubled={nexus.nexusTypeDoubled} />
							</div>
							<div className="nexus-coords">
								({nexus.x}|{nexus.y})
							</div>
							<div className="nexus-points">{nexus.points} inf</div>
							<div className="nexus-badges">
								{nexus.buildQueue.length > 0 && (
									<span className="nexus-badge" title="Construction in progress">
										<ConstructionIcon size={12} />
									</span>
								)}
								{nexus.trainingQueue.length > 0 && (
									<span className="nexus-badge" title="Training in progress">
										<CombatIcon size={12} />
									</span>
								)}
								{unreadNexusIds?.has(String(nexus._id)) && (
									<span className="nexus-badge nexus-badge-unread" title="Unread combat logs">
										<ScrollText size={12} />
									</span>
								)}
							</div>
						</div>
					))}
				</div>

				{user && (
					<div className="commander-card" aria-label="Commander summary">
						<Avatar
							username={user.username}
							avatarUrl={user.avatarUrl ?? null}
							avatarUrlSm={user.avatarUrlSm ?? null}
							size="md"
							className={`commander-avatar${user.supporterTier === 'officer' ? ' supporter-border supporter-border-officer' : ''}${user.supporterTier === 'commander' ? ' supporter-border supporter-border-commander' : ''}`}
							ariaHidden
						/>
						<div className="commander-info">
							<div className="commander-name-row">
								<span
									className={[
										'commander-name',
										user.isSupporter ? 'supporter-name' : null,
										user.supporterTier === 'recruit' ? 'supporter-tier-recruit' : null,
										user.supporterTier === 'officer' ? 'supporter-tier-officer' : null,
										user.supporterTier === 'commander' ? 'supporter-tier-commander' : null
									]
										.filter(Boolean)
										.join(' ')}
								>
									{user.username}
								</span>
								{/* No rank badges here: this card is width-constrained and a badge
								    would truncate the username (see profile page for badges). */}
							</div>
							<div className="commander-meta">Commander · {totalPoints.toLocaleString()} inf</div>
						</div>
					</div>
				)}

				<SupportTiersCard
					variant="compact"
					currentTier={user?.supporterTier ?? null}
					isFounder={user?.isFounder}
					isSupporter={user?.isSupporter}
				/>
			</nav>

			{showGroupManager && (
				<GroupManagerModal
					groups={groups}
					nexuses={nexuses}
					onClose={() => setShowGroupManager(false)}
					onGroupsChange={updateGroups}
				/>
			)}
		</>
	);
};

interface GroupManagerModalProps {
	groups: NexusGroup[];
	nexuses: Nexus[];
	onClose: () => void;
	onGroupsChange: (groups: NexusGroup[]) => void;
}

const GroupManagerModal: React.FC<GroupManagerModalProps> = ({
	groups,
	nexuses,
	onClose,
	onGroupsChange
}) => {
	const [localGroups, setLocalGroups] = useState<NexusGroup[]>(groups);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');
	const [newGroupName, setNewGroupName] = useState('');
	const [selectedGroupId, setSelectedGroupId] = useState<string | null>(localGroups[0]?.id ?? null);
	const [saving, setSaving] = useState(false);

	const selectedGroup = localGroups.find((g) => g.id === selectedGroupId) ?? null;

	const handleCreate = async () => {
		const name = newGroupName.trim();
		if (!name) return;
		setSaving(true);
		try {
			const res = await createNexusGroup(name);
			setLocalGroups(res.data);
			onGroupsChange(res.data);
			setSelectedGroupId(res.data[res.data.length - 1]?.id ?? null);
			setNewGroupName('');
		} finally {
			setSaving(false);
		}
	};

	const handleRename = async (groupId: string) => {
		const name = editName.trim();
		if (!name) return;
		setSaving(true);
		try {
			const res = await renameNexusGroup(groupId, name);
			setLocalGroups(res.data);
			onGroupsChange(res.data);
			setEditingId(null);
		} finally {
			setSaving(false);
		}
	};

	const handleDelete = async (groupId: string) => {
		if (!confirm('Delete this group? Nexuses will not be affected.')) return;
		setSaving(true);
		try {
			const res = await deleteNexusGroup(groupId);
			setLocalGroups(res.data);
			onGroupsChange(res.data);
			setSelectedGroupId(res.data[0]?.id ?? null);
		} finally {
			setSaving(false);
		}
	};

	const handleToggleNexus = async (nexusId: string) => {
		if (!selectedGroup) return;
		const already = selectedGroup.nexusIds.includes(nexusId);
		const newIds = already
			? selectedGroup.nexusIds.filter((id) => id !== nexusId)
			: [...selectedGroup.nexusIds, nexusId];
		setSaving(true);
		try {
			const res = await setGroupNexuses(selectedGroup.id, newIds);
			setLocalGroups(res.data);
			onGroupsChange(res.data);
		} finally {
			setSaving(false);
		}
	};

	return (
		<div className="group-modal-overlay" onClick={onClose}>
			<div className="group-modal" onClick={(e) => e.stopPropagation()}>
				<div className="group-modal-header">
					<h2>Manage Nexus Groups</h2>
					<button className="group-modal-close" onClick={onClose} aria-label="Close">
						<X size={18} />
					</button>
				</div>

				<div className="group-modal-body">
					<div className="group-modal-left">
						<div className="group-list">
							{localGroups.map((g) => (
								<div
									key={g.id}
									className={`group-list-item${selectedGroupId === g.id ? ' active' : ''}`}
									onClick={() => {
										setSelectedGroupId(g.id);
										setEditingId(null);
									}}
								>
									{editingId === g.id ? (
										<div className="group-edit-row" onClick={(e) => e.stopPropagation()}>
											<input
												className="group-name-input"
												value={editName}
												onChange={(e) => setEditName(e.target.value)}
												onKeyDown={(e) => {
													if (e.key === 'Enter') handleRename(g.id);
													if (e.key === 'Escape') setEditingId(null);
												}}
												autoFocus
												maxLength={32}
											/>
											<button
												className="group-save-btn"
												disabled={saving}
												onClick={() => handleRename(g.id)}
												aria-label="Save name"
											>
												<Check size={14} />
											</button>
											<button
												className="group-cancel-btn"
												onClick={() => setEditingId(null)}
												aria-label="Cancel"
											>
												<X size={14} />
											</button>
										</div>
									) : (
										<>
											<span className="group-list-name">{g.name}</span>
											<span className="group-list-count">{g.nexusIds.length}</span>
											<button
												className="group-edit-btn"
												onClick={(e) => {
													e.stopPropagation();
													setEditingId(g.id);
													setEditName(g.name);
												}}
												aria-label="Rename group"
											>
												<Pencil size={13} />
											</button>
											<button
												className="group-delete-btn"
												disabled={saving}
												onClick={(e) => {
													e.stopPropagation();
													handleDelete(g.id);
												}}
												aria-label="Delete group"
											>
												<Trash2 size={13} />
											</button>
										</>
									)}
								</div>
							))}
						</div>

						{localGroups.length < 10 && (
							<div className="group-create-row">
								<input
									className="group-name-input"
									placeholder="New group name…"
									value={newGroupName}
									onChange={(e) => setNewGroupName(e.target.value)}
									onKeyDown={(e) => {
										if (e.key === 'Enter') handleCreate();
									}}
									maxLength={32}
								/>
								<button
									className="group-create-btn"
									disabled={saving || !newGroupName.trim()}
									onClick={handleCreate}
								>
									+ Add
								</button>
							</div>
						)}
					</div>

					<div className="group-modal-right">
						{selectedGroup ? (
							<>
								<h3 className="group-assign-title">Nexuses in &quot;{selectedGroup.name}&quot;</h3>
								<div className="group-nexus-list">
									{nexuses.map((n) => {
										const inGroup = selectedGroup.nexusIds.includes(n._id);
										return (
											<label
												key={n._id}
												className={`group-nexus-item${inGroup ? ' in-group' : ''}`}
											>
												<input
													type="checkbox"
													checked={inGroup}
													disabled={saving}
													onChange={() => handleToggleNexus(n._id)}
												/>
												<span className="group-nexus-name">{n.name}</span>
												<span className="group-nexus-coords">
													({n.x}|{n.y})
												</span>
											</label>
										);
									})}
								</div>
							</>
						) : (
							<p className="group-empty-hint">Create or select a group to assign nexuses.</p>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

// NexusSidebar re-rendering is a hot path: GameLayout subscribes to React Query polling
// (myNexuses, unreadReports, dominance) and would push fresh props through every 30s tick.
// Memoizing here means the list of nexus rows only re-renders when something it actually
// displays has changed.
export default React.memo(NexusSidebar);
