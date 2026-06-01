'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
	const router = useRouter();

	useEffect(() => {
		const token = sessionStorage.getItem('admin_basic_auth');
		router.replace(token ? '/admin' : '/auth');
	}, [router]);

	return null;
}
