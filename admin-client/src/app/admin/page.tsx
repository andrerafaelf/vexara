'use client';

import AdminShell from '@/components/AdminShell';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

export default function AdminPage() {
	const router = useRouter();
	const [checked, setChecked] = useState(false);

	useEffect(() => {
		let cancelled = false;
		fetch(`${ADMIN_API_URL}/auth/me`, { credentials: 'include' })
			.then((res) => {
				if (cancelled) return;
				if (res.ok) setChecked(true);
				else router.replace('/auth');
			})
			.catch(() => {
				if (!cancelled) router.replace('/auth');
			});
		return () => {
			cancelled = true;
		};
	}, [router]);

	const handleLogout = async () => {
		try {
			await fetch(`${ADMIN_API_URL}/auth/logout`, {
				method: 'POST',
				credentials: 'include'
			});
		} catch {
			/* ignore */
		}
		router.replace('/auth');
	};

	if (!checked) return null;
	return <AdminShell onLogout={handleLogout} />;
}
