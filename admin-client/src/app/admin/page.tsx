'use client';

import AdminShell from '@/components/AdminShell';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminPage() {
	const router = useRouter();

	useEffect(() => {
		// Check if the admin is authenticated by looking for the basic auth token in session storage
		if (!sessionStorage.getItem('admin_basic_auth')) {
			router.replace('/auth');
		}
	}, [router]);

	const handleLogout = () => {
		sessionStorage.removeItem('admin_basic_auth');
		router.replace('/auth');
	};

	return <AdminShell onLogout={handleLogout} />;
}
