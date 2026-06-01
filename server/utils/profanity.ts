// ─── Normalization ────────────────────────────────────────────────────────────
const ZERO_WIDTH_RE = /[­​-‏‪-‮⁠-⁤⁪-⁯﻿ ᠎]/g;

// Stronger homoglyph + leet mapping
const HOMOGLYPH_MAP: Record<string, string> = {
	// a
	à: 'a',
	á: 'a',
	â: 'a',
	ã: 'a',
	ä: 'a',
	å: 'a',
	ā: 'a',
	ă: 'a',
	ą: 'a',
	ɑ: 'a',
	α: 'a',
	а: 'a',
	'@': 'a',
	'4': 'a',
	// b
	ƀ: 'b',
	ɓ: 'b',
	ƃ: 'b',
	ь: 'b',
	б: 'b',
	// c
	ç: 'c',
	ć: 'c',
	ĉ: 'c',
	č: 'c',
	с: 'c',
	ϲ: 'c',
	ɕ: 'c',
	// d
	ď: 'd',
	đ: 'd',
	ɗ: 'd',
	ԁ: 'd',
	// e
	è: 'e',
	é: 'e',
	ê: 'e',
	ë: 'e',
	ē: 'e',
	ĕ: 'e',
	ė: 'e',
	ę: 'e',
	ě: 'e',
	ɛ: 'e',
	е: 'e',
	ё: 'e',
	ε: 'e',
	'3': 'e',
	// f
	ƒ: 'f',
	// g
	ĝ: 'g',
	ğ: 'g',
	ġ: 'g',
	ģ: 'g',
	ɡ: 'g',
	ɢ: 'g',
	'9': 'g',
	// h
	ĥ: 'h',
	ħ: 'h',
	н: 'h',
	ʜ: 'h',
	// i
	ì: 'i',
	í: 'i',
	î: 'i',
	ï: 'i',
	ĩ: 'i',
	ī: 'i',
	ĭ: 'i',
	į: 'i',
	ı: 'i',
	ɪ: 'i',
	і: 'i',
	ї: 'i',
	ι: 'i',
	'1': 'i',
	'|': 'i',
	'!': 'i',
	// j
	ĵ: 'j',
	ϳ: 'j',
	ј: 'j',
	// k
	ķ: 'k',
	ĸ: 'k',
	κ: 'k',
	к: 'k',
	// l
	ĺ: 'l',
	ļ: 'l',
	ľ: 'l',
	ŀ: 'l',
	ł: 'l',
	ʟ: 'l',
	// m
	м: 'm',
	ɱ: 'm',
	// n
	ñ: 'n',
	ń: 'n',
	ņ: 'n',
	ň: 'n',
	ŋ: 'n',
	п: 'n',
	ɴ: 'n',
	// o
	ò: 'o',
	ó: 'o',
	ô: 'o',
	õ: 'o',
	ö: 'o',
	ø: 'o',
	ō: 'o',
	ŏ: 'o',
	ő: 'o',
	ο: 'o',
	о: 'o',
	'0': 'o',
	// p
	р: 'p',
	ρ: 'p',
	ƥ: 'p',
	// r
	ŕ: 'r',
	ŗ: 'r',
	ř: 'r',
	г: 'r',
	ɾ: 'r',
	// s
	ś: 's',
	ŝ: 's',
	ş: 's',
	š: 's',
	ѕ: 's',
	$: 's',
	'5': 's',
	// t
	ţ: 't',
	ť: 't',
	ŧ: 't',
	т: 't',
	τ: 't',
	'7': 't',
	// u
	ù: 'u',
	ú: 'u',
	û: 'u',
	ü: 'u',
	ũ: 'u',
	ū: 'u',
	ŭ: 'u',
	ů: 'u',
	ű: 'u',
	ų: 'u',
	υ: 'u',
	// v
	ν: 'v',
	ѵ: 'v',
	// w
	ŵ: 'w',
	ω: 'w',
	ш: 'w',
	щ: 'w',
	// x
	χ: 'x',
	х: 'x',
	'×': 'x',
	// y
	ý: 'y',
	ÿ: 'y',
	ŷ: 'y',
	γ: 'y',
	у: 'y',
	// z
	ź: 'z',
	ż: 'z',
	ž: 'z',
	ʐ: 'z',
	ζ: 'z',
	'2': 'z'
};

const HOMOGLYPH_RE = new RegExp(
	Object.keys(HOMOGLYPH_MAP)
		.map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
		.join('|'),
	'g'
);

function normalize(text: string): string {
	return text
		.replace(ZERO_WIDTH_RE, '') // Remove zero-width chars
		.normalize('NFKD') // Decompose ligatures, accents, fullwidth
		.replace(HOMOGLYPH_RE, (ch) => HOMOGLYPH_MAP[ch] ?? ch)
		.replace(/[\s._\-!@#$%^&*()+=[\]{}|;:'",.<>?/~`]+/g, '') // Aggressive noise removal
		.toLowerCase();
}

// ─── Block Lists ──────────────────────────────────────────────────────────────
const BLOCKED_ALWAYS = [
	'chink',
	'spic',
	'kike',
	'wetback',
	'gook',
	'beaner',
	'towelhead',
	'raghead',
	'sandnigger',
	'zipperhead',
	'coon',
	'jigaboo',
	'porchmonkey',
	'spook',
	'junglebunny',
	'mudperson',
	'redskin',
	'halfbreed',
	'mulatto',
	'squaw',
	'injun',
	'abo',
	'pikey',
	'paki',
	'wop',
	'dago',
	'polack',
	'hymie',
	'slope',
	'kraut',
	'nazi',
	'whitepower',
	'whitepride',
	'heil',
	'aryan',
	'faggot',
	'fag',
	'dyke',
	'tranny',
	'spastic',
	'cripple',
	'mongoloid'
];

// N-word with very common bypass patterns
const NWORD_RE = /(?<![a-z0-9])n[i1l!]+[g8]+[g8]+[a@4e3]+r?(?![a-z0-9])/i;

function buildPattern(words: string[]): RegExp {
	if (words.length === 0) return /(?!)/; // never matches

	const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

	return new RegExp(`(?<![a-z0-9])(${escaped.join('|')})(?![a-z0-9])`, 'i');
}

const WORD_LIST_RE = buildPattern(BLOCKED_ALWAYS);

function isBlocked(raw: string): boolean {
	if (!raw || typeof raw !== 'string') return false;

	const text = normalize(raw);

	// Check n-word first (most important)
	if (NWORD_RE.test(text)) return true;

	// Then the rest of the list
	return WORD_LIST_RE.test(text);
}

// ─── Exports ──────────────────────────────────────────────────────────────────
export function containsBlockedUsername(username: string): boolean {
	return isBlocked(username);
}

export function containsBlockedChatWord(text: string): boolean {
	return isBlocked(text);
}
