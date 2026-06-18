'use client';

import { useCallback, useEffect, useState } from 'react';
import {
	getNotificationPreferences,
	getVapidPublicKey,
	subscribePush,
	unsubscribePush,
	updateNotificationPreferences
} from '@/services/api';

export interface NotificationPreferences {
	attackIncoming: boolean;
	attackResolved: boolean;
	troopsReturned: boolean;
	buildingComplete: boolean;
	troopComplete: boolean;
	resourcesFull: boolean;
	troopTransfer: boolean;
	factionInvite: boolean;
	factionPromotion: boolean;
	factionWar: boolean;
	factionDiplomacy: boolean;
	factionMessage: boolean;
	friendRequest: boolean;
	friendMessage: boolean;
	nearbyGalaxyEvent: boolean;
	protectionExpiring: boolean;
	tokenGranted: boolean;
	autoRequeuePaused: boolean;
}

const DEFAULT_PREFS: NotificationPreferences = {
	attackIncoming: true,
	attackResolved: true,
	troopsReturned: true,
	buildingComplete: true,
	troopComplete: true,
	resourcesFull: true,
	troopTransfer: true,
	factionInvite: true,
	factionPromotion: true,
	factionWar: true,
	factionDiplomacy: true,
	factionMessage: true,
	friendRequest: true,
	friendMessage: true,
	nearbyGalaxyEvent: true,
	protectionExpiring: true,
	tokenGranted: true,
	autoRequeuePaused: true
};

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
	const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
	const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
	const rawData = atob(base64);
	return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0))).buffer;
}

export type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

export function useNotifications() {
	const [permission, setPermission] = useState<PermissionState>('default');
	const [isSubscribed, setIsSubscribed] = useState(false);
	const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFS);
	const [loading, setLoading] = useState(false);
	const [swReady, setSwReady] = useState(false);

	// Register service worker on mount
	useEffect(() => {
		if (typeof window === 'undefined') return;
		if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
			setPermission('unsupported');
			return;
		}

		setPermission(Notification.permission as PermissionState);

		navigator.serviceWorker
			.register('/sw.js', { scope: '/' })
			.then((reg) => {
				setSwReady(true);
				return reg.pushManager.getSubscription();
			})
			.then((sub) => {
				setIsSubscribed(!!sub);
			})
			.catch(() => {});
	}, []);

	// Load preferences when subscribed
	useEffect(() => {
		if (!isSubscribed) return;
		getNotificationPreferences()
			.then(({ data }) => setPreferences({ ...DEFAULT_PREFS, ...data }))
			.catch(() => {});
	}, [isSubscribed]);

	const subscribe = useCallback(async (): Promise<boolean> => {
		if (!swReady) return false;
		setLoading(true);
		try {
			const perm = await Notification.requestPermission();
			setPermission(perm as PermissionState);
			if (perm !== 'granted') return false;

			const { data } = await getVapidPublicKey();
			const applicationServerKey = urlBase64ToUint8Array(data.vapidPublicKey);

			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey
			});

			await subscribePush(sub.toJSON() as PushSubscriptionJSON);
			setIsSubscribed(true);
			const { data: prefs } = await getNotificationPreferences();
			setPreferences({ ...DEFAULT_PREFS, ...prefs });
			return true;
		} catch {
			return false;
		} finally {
			setLoading(false);
		}
	}, [swReady]);

	const unsubscribe = useCallback(async (): Promise<boolean> => {
		setLoading(true);
		try {
			const reg = await navigator.serviceWorker.ready;
			const sub = await reg.pushManager.getSubscription();
			if (sub) {
				await unsubscribePush(sub.endpoint);
				await sub.unsubscribe();
			}
			setIsSubscribed(false);
			return true;
		} catch {
			return false;
		} finally {
			setLoading(false);
		}
	}, []);

	const updatePreference = useCallback(
		async (key: keyof NotificationPreferences, value: boolean) => {
			const optimistic = { ...preferences, [key]: value };
			setPreferences(optimistic);
			try {
				const { data } = await updateNotificationPreferences({ [key]: value });
				setPreferences({ ...DEFAULT_PREFS, ...data });
			} catch {
				setPreferences(preferences);
			}
		},
		[preferences]
	);

	return {
		permission,
		isSubscribed,
		preferences,
		loading,
		swReady,
		subscribe,
		unsubscribe,
		updatePreference
	};
}
