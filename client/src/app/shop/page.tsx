'use client';

import GameLayout from '@/components/GameLayout';
import ShopPage from '@/components/ShopPage';

export default function ShopRoute() {
	return (
		<GameLayout activePage="shop">
			<ShopPage />
		</GameLayout>
	);
}
