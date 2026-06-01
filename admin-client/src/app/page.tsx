'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const ADMIN_API_URL = process.env.NEXT_PUBLIC_ADMIN_API_URL || 'http://localhost:3002/api/admin';

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		fetch(`${ADMIN_API_URL}/auth/me`, { credentials: 'include' })
			.then((res) => {
				router.replace(res.ok ? '/admin' : '/auth');
			})
			.catch(() => router.replace('/auth'));
	}, [router]);

	return null;
}
