import React, { useCallback, useEffect, useState } from 'react';
import {
  createNexusGroup,
  deleteNexusGroup,
  getNexusGroups,
  renameNexusGroup,
  setGroupNexuses,
} from '../services/api';
import { Nexus, NexusGroup } from '../types/game';
import GalaxyChip from './GalaxyChip';

interface NexusSidebarProps {
  nexuses: Nexus[];
  selectedNexusId: string | null;
  onSelectNexus: (nexus: Nexus) => void;
  onGroupsChange?: (groups: NexusGroup[]) => void;
  unreadNexusIds?: Set<string>;
}

const GEAR_THRESHOLD = 2;

const NexusSidebar: React.FC<NexusSidebarProps> = ({
  nexuses,
  selectedNexusId,
  onSelectNexus,
  onGroupsChange,
  unreadNexusIds,
}) => {
  const [groups, setGroups] = useState<NexusGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [showGroupManager, setShowGroupManager] = useState(false);

  const updateGroups = useCallback(
    (next: NexusGroup[]) => {
      setGroups(next);
      onGroupsChange?.(next);
    },
    [onGroupsChange],
  );

  const loadGroups = useCallback(async () => {
    try {
      const response = await getNexusGroups();
      updateGroups(response.data ?? []);
    } catch (err) {
      console.error('Error loading groups:', err);
    }
  }, [updateGroups]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  const visibleNexuses =
    activeGroupId !== null
      ? nexuses.filter((n) => groups.find((g) => g.id === activeGroupId)?.nexusIds.includes(n._id))
      : nexuses;

  return (
    <>
      <nav className="nexus-nav">
        <GalaxyChip onGalaxyChanged={() => window.location.reload()} />
        <div className="nexus-nav-header">
          <h3>Your Nexuses</h3>
          {nexuses.length >= GEAR_THRESHOLD && (
            <button
              className="group-manage-btn"
              onClick={() => setShowGroupManager(true)}
              title="Manage groups"
            >
              ⚙
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
              {nexus.name}
              {nexus.nexusType === 'Resource Depot' && <span title="Resource Depot — 2x Production"> ⚡</span>}
              {nexus.nexusType === 'Supply Cache' && <span title="Supply Cache — 2x Storage"> 📦</span>}
              {nexus.nexusType === 'Military Outpost' && <span title="Military Outpost — +50% Shield, 25% Faster Training"> 🛡️</span>}
              {nexus.nexusType === 'Reclaimed Outpost' && <span title="Reclaimed Outpost — 20% Faster Construction"> 🔧</span>}
            </div>
            <div className="nexus-coords">
              ({nexus.x}|{nexus.y})
            </div>
            <div className="nexus-points">{nexus.points} inf</div>
            {nexus.buildQueue.length > 0 && <div className="nexus-badge">🏗️</div>}
            {nexus.trainingQueue.length > 0 && <div className="nexus-badge">🎖️</div>}
            {unreadNexusIds?.has(String(nexus._id)) && (
              <div className="nexus-badge nexus-badge-unread" title="Unread combat reports">📜</div>
            )}
          </div>
        ))}
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
  onGroupsChange,
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
          <button className="group-modal-close" onClick={onClose}>
            ✕
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
                      >
                        ✓
                      </button>
                      <button className="group-cancel-btn" onClick={() => setEditingId(null)}>
                        ✕
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
                      >
                        ✏
                      </button>
                      <button
                        className="group-delete-btn"
                        disabled={saving}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(g.id);
                        }}
                      >
                        🗑
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

export default NexusSidebar;
