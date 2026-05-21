'use client';

import React, { useState } from 'react';
import { useNotifications, NotificationPreferences } from '@/hooks/useNotifications';
import PwaGuideModal from './PwaGuideModal';
import '@/styles/NotificationSettings.css';

const PREF_LABELS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  { key: 'attackIncoming', label: 'Incoming Attacks', description: 'When your nexus is attacked' },
  { key: 'attackResolved', label: 'Attack Resolved', description: 'When your strike lands at the target' },
  { key: 'troopsReturned', label: 'Troops Returned', description: 'When attacking troops arrive back home' },
  { key: 'buildingComplete', label: 'Building Complete', description: 'When a construction finishes' },
  { key: 'troopComplete', label: 'Training Complete', description: 'When a troop training batch finishes' },
  { key: 'resourcesFull', label: 'Storage Full', description: 'When all resources hit max capacity' },
  { key: 'troopTransfer', label: 'Troop Transfer', description: 'When transferred troops arrive or return' },
  { key: 'protectionExpiring', label: 'Protection Expiring', description: '24h before newbie protection ends on a nexus' },
  { key: 'tokenGranted', label: 'Tokens Earned', description: 'When you earn referral or reward tokens' },
  { key: 'friendRequest', label: 'Friend Requests', description: 'When someone sends you a friend request' },
  { key: 'friendMessage', label: 'Private Messages', description: 'When a friend sends you a message' },
  { key: 'factionInvite', label: 'Faction Invites', description: 'When a faction invites you to join' },
  { key: 'factionPromotion', label: 'Faction Promotions', description: 'When you are promoted to officer' },
  { key: 'factionWar', label: 'Faction Wars', description: 'When war is declared on your faction' },
  { key: 'factionDiplomacy', label: 'Faction Diplomacy', description: 'When a treaty is proposed or signed' },
  { key: 'nearbyGalaxyEvent', label: 'Nearby Galaxy Events', description: 'When a rogue AI, storm or derelict spawns near your nexuses' },
];

export default function NotificationSettings() {
  const { permission, isSubscribed, preferences, loading, swReady, subscribe, unsubscribe, updatePreference } =
    useNotifications();
  const [showGuide, setShowGuide] = useState(false);

  if (permission === 'unsupported') {
    return (
      <div className="notif-settings">
        <p className="notif-unsupported">Push notifications are not supported in this browser.</p>
      </div>
    );
  }

  return (
    <>
      {showGuide && <PwaGuideModal onClose={() => setShowGuide(false)} />}
      <div className="notif-settings">
        <div className="notif-header">
          <h3 className="notif-title">Push Notifications</h3>
          <div className="notif-header-right">
            <button
              className="notif-guide-btn"
              onClick={() => setShowGuide(true)}
              title="Setup guide for mobile"
              aria-label="Open mobile setup guide"
            >
              ?
            </button>
            <div className="notif-status">
              <span className={`notif-dot ${isSubscribed ? 'notif-dot--on' : 'notif-dot--off'}`} />
              <span className="notif-status-text">{isSubscribed ? 'Enabled' : 'Disabled'}</span>
            </div>
          </div>
        </div>

        {permission === 'denied' && (
          <div className="notif-denied">
            Notifications are blocked. Enable them in your browser site settings.
          </div>
        )}

        {!isSubscribed && permission !== 'denied' && (
          <button
            className="notif-enable-btn"
            onClick={subscribe}
            disabled={loading || !swReady}
          >
            {loading ? 'Enabling...' : 'Enable Notifications'}
          </button>
        )}

        {isSubscribed && (
          <>
            <div className="notif-prefs-list">
              {PREF_LABELS.map(({ key, label, description }) => (
                <label key={key} className="notif-pref-row">
                  <div className="notif-pref-text">
                    <span className="notif-pref-label">{label}</span>
                    <span className="notif-pref-desc">{description}</span>
                  </div>
                  <div
                    className={`notif-toggle ${preferences[key] ? 'notif-toggle--on' : ''}`}
                    role="switch"
                    aria-checked={preferences[key]}
                    tabIndex={0}
                    onClick={() => updatePreference(key, !preferences[key])}
                    onKeyDown={(e) => e.key === 'Enter' && updatePreference(key, !preferences[key])}
                  >
                    <span className="notif-toggle-thumb" />
                  </div>
                </label>
              ))}
            </div>

            <button
              className="notif-disable-btn"
              onClick={unsubscribe}
              disabled={loading}
            >
              {loading ? 'Disabling...' : 'Disable All Notifications'}
            </button>
          </>
        )}
      </div>
    </>
  );
}
