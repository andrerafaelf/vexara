'use client';

import { Globe2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { getMyGalaxy } from '../services/api';
import GalaxyPicker, { Galaxy } from './GalaxyPicker';

interface Props {
  /** Called when the user picks a (new or existing) galaxy so the page can refresh data. */
  onGalaxyChanged?: (galaxy: Galaxy) => void;
}

const GalaxyChip: React.FC<Props> = ({ onGalaxyChanged }) => {
  const [activeGalaxy, setActiveGalaxy] = useState<Galaxy | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerForced, setPickerForced] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getMyGalaxy();
        if (cancelled) return;
        const g = res.data?.activeGalaxy ?? null;
        setActiveGalaxy(g);
        if (!g) {
          setPickerForced(true);
          setShowPicker(true);
        }
      } catch {
        // The api layer dispatches galaxy:needs-selection on 409 — handled below.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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
            setActiveGalaxy(g);
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
