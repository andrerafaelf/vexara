export const KOFI_URL = 'https://ko-fi.com/andrerfferreira';

export const VP_PACKS = [
	{ label: 'Starter',        vp: 1_000, price: '€4.99',  url: 'https://ko-fi.com/s/de07a3f9e8' },
	{ label: 'Commander Pack', vp: 2_500, price: '€9.99',  url: 'https://ko-fi.com/s/3476c3fa4d' },
	{ label: 'Warlord Pack',   vp: 6_000, price: '€19.99', url: 'https://ko-fi.com/s/0d1957e75b' },
] as const;

export const SUPPORTER_TIERS = [
	{ key: 'recruit',   label: 'Recruit Supporter',   amount: '€5',  url: 'https://ko-fi.com/s/4e180806f6' },
	{ key: 'officer',   label: 'Officer Supporter',   amount: '€10', url: 'https://ko-fi.com/s/9bf84f5154' },
	{ key: 'commander', label: 'Commander Supporter', amount: '€25', url: 'https://ko-fi.com/s/35e981fe6e' },
] as const;
