'use client';

import React, { useState } from 'react';
import '@/styles/PwaGuideModal.css';

type Platform = 'desktop' | 'ios' | 'android';

const STEPS: Record<Platform, { pwa?: string[]; notif: string[] }> = {
  desktop: {
    notif: [
      'Go to your Profile page.',
      'Open the Notifications tab.',
      'Click "Enable Notifications".',
      'Allow notifications when the browser prompts you.',
    ],
  },
  ios: {
    pwa: [
      'Open Vexara in Safari (not Chrome or Firefox).',
      'Tap the Share button at the bottom of the screen.',
      'Scroll down and tap "Add to Home Screen".',
      'Tap "Add" in the top-right corner.',
      'Open the app from your Home Screen icon.',
    ],
    notif: [
      'Go to your Profile page.',
      'Open the Notifications tab.',
      'Tap "Enable Notifications" and allow when prompted.',
    ],
  },
  android: {
    pwa: [
      'Open Vexara in Chrome.',
      'Tap the three-dot menu in the top-right corner.',
      'Tap "Add to Home screen" or "Install app".',
      'Tap "Install" to confirm.',
      'Open the app from your Home Screen icon.',
    ],
    notif: [
      'Go to your Profile page.',
      'Open the Notifications tab.',
      'Tap "Enable Notifications" and allow when prompted.',
    ],
  },
};

function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'desktop';
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

interface Props {
  onClose: () => void;
}

export default function PwaGuideModal({ onClose }: Props) {
  const [platform, setPlatform] = useState<Platform>(detectPlatform);

  const steps = STEPS[platform];

  return (
    <div className="pwa-modal-overlay" onClick={onClose}>
      <div className="pwa-modal" onClick={(e) => e.stopPropagation()}>
        <button className="pwa-modal-close" onClick={onClose} aria-label="Close">×</button>

        <div className="pwa-modal-header">
          <div className="pwa-modal-icon">🔔</div>
          <h2 className="pwa-modal-title">Enable Notifications</h2>
          <p className="pwa-modal-subtitle">
            Follow the steps for your device to receive push notifications.
          </p>
        </div>

        {platform === 'desktop' ? null : (
          <div className="pwa-modal-tabs">
            <button
              className={`pwa-tab ${platform === 'ios' ? 'pwa-tab--active' : ''}`}
              onClick={() => setPlatform('ios')}
            >
              iOS
            </button>
            <button
              className={`pwa-tab ${platform === 'android' ? 'pwa-tab--active' : ''}`}
              onClick={() => setPlatform('android')}
            >
              Android
            </button>
          </div>
        )}

        {steps.pwa && (
          <div className="pwa-modal-section">
            <h3 className="pwa-modal-section-title">
              <span className="pwa-modal-step-badge">1</span>
              Install as Home Screen App
            </h3>
            <ol className="pwa-modal-steps">
              {steps.pwa.map((step, i) => (
                <li key={i} className="pwa-modal-step">{step}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="pwa-modal-section">
          <h3 className="pwa-modal-section-title">
            <span className="pwa-modal-step-badge">{steps.pwa ? '2' : '1'}</span>
            Enable Push Notifications
          </h3>
          <ol className="pwa-modal-steps">
            {steps.notif.map((step, i) => (
              <li key={i} className="pwa-modal-step">{step}</li>
            ))}
          </ol>
        </div>

        {platform === 'ios' && (
          <div className="pwa-modal-note">
            iOS 16.4+ is required for push notifications. Make sure your iPhone is up to date.
          </div>
        )}

        <button className="pwa-modal-done" onClick={onClose}>
          Got it
        </button>
      </div>
    </div>
  );
}
