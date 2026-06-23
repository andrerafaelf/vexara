'use client';

import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
	createNexusGroup,
	deleteNexusGroup,
	getNexusGroups,
	renameNexusGroup,
	setGroupNexuses
} from '../services/api';
import { NEXUS_GROUPS_KEY } from './NexusSidebar';
import { Check, Pencil, ScrollText, Settings, Trash2, X } from 'lucide-react';
import '../styles/MobileNexusDrawer.css';
import { Nexus, NexusGroup } from '../types/game';
import GalaxyChip from './GalaxyChip';
import NexusTypeBadge from './NexusTypeBadge';
import { CombatIcon, ConstructionIcon } from './VexaraIcons';

interface MobileNexusDrawerProps {
	nexuses: Nexus[];
	selectedNexusId: string | null;
	onSelectNexus: (nexus: Nexus) => void;
	isOpen: boolean;
	onClose: () => void;
	unreadNexusIds?: Set<string>;
}

const GEAR_THRESHOLD = 2;

const MobileNexusDrawer: React.FC<MobileNexusDrawerProps> = ({
	nexuses,
	selectedNexusId,
	onSelectNexus,
	isOpen,
	onClose,
	unreadNexusIds
}) => {
	const qc = useQueryClient();
	const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
	const [showGroupManager, setShowGroupManager] = useState(false);

	const { data: groups = [] } = useQuery<NexusGroup[]>({
		queryKey: NEXUS_GROUPS_KEY,
		queryFn: () => getNexusGroups().then((r) => r.data ?? []),
		staleTime: 60_000
	});

	const visibleNexuses = (() => {
		return activeGroupId !== null
			? nexuses.filter((n) => groups.find((g) => g.id === activeGroupId)?.nexusIds.includes(n._id))
			: nexuses;
	})();

	const handleSelect = (nexus: Nexus) => {
		onSelectNexus(nexus);
		onClose();
	};

	return (
		<>
			<div className={`mobile-nexus-backdrop ${isOpen ? 'open' : ''}`} onClick={onClose} />
			<aside className={`mobile-nexus-drawer ${isOpen ? 'open' : ''}`}>
				<div style={{ padding: '12px 16px 0' }}>
					<GalaxyChip onGalaxyChanged={() => window.location.reload()} />
				</div>
				<div className="mobile-nexus-drawer-header">
					<h3>Your Nexuses</h3>
					<div className="mobile-nexus-drawer-header-actions">
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
						<button
							className="mobile-nexus-drawer-close"
							onClick={onClose}
							aria-label="Close nexus panel"
						>
							<X size={18} />
						</button>
					</div>
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

				<div className="mobile-nexus-drawer-list">
					{visibleNexuses.map((nexus) => (
						<div
							key={nexus._id}
							className={`nexus-item ${String(nexus._id) === selectedNexusId ? 'active' : ''}`}
							onClick={() => handleSelect(nexus)}
						>
							<NexusTypeBadge type={nexus.nexusType} doubled={nexus.nexusTypeDoubled} size={72} />
							<div className="nexus-item-body">
								<div className="nexus-name">
									<span className="nexus-name-text">{nexus.name}</span>
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
										<span className="nexus-badge nexus-badge-unread" title="Unread reports">
											<ScrollText size={12} />
										</span>
									)}
								</div>
							</div>
						</div>
					))}
				</div>
			</aside>

			{showGroupManager && (
				<GroupManagerModal
					groups={groups}
					nexuses={nexuses}
					onClose={() => setShowGroupManager(false)}
					onGroupsChange={(next) => qc.setQueryData(NEXUS_GROUPS_KEY, next)}
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

	const update = (next: NexusGroup[]) => {
		setLocalGroups(next);
		onGroupsChange(next);
	};

	const handleCreate = async () => {
		const name = newGroupName.trim();
		if (!name) return;
		setSaving(true);
		try {
			const res = await createNexusGroup(name);
			update(res.data);
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
			update(res.data);
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
			update(res.data);
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
			update(res.data);
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

export default React.memo(MobileNexusDrawer);
