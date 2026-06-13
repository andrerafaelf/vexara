export type CommanderTitle =
	| 'Iron Commander'
	| 'Warlord'
	| 'Conqueror'
	| 'Veteran'
	| null;

interface TitleSource {
	galaxiesWon: number;
	galaxiesPlayed: number;
}

// Derive the highest earned commander title from permanent stats.
// Titles are mutually exclusive — the highest-prestige one wins.
// Order: Warlord > Conqueror > Iron Commander > Veteran > null
export function resolveTitle(user: TitleSource): CommanderTitle {
	if (user.galaxiesWon >= 2) return 'Warlord';
	if (user.galaxiesWon >= 1) return 'Conqueror';
	if (user.galaxiesPlayed >= 5) return 'Iron Commander';
	if (user.galaxiesPlayed >= 3) return 'Veteran';
	return null;
}
