// Words blocked everywhere (usernames + chat).
// Racist/slur terms that are never acceptable in any context.
const BLOCKED_ALWAYS = [
  'nigger',
  'nigga',
  'nigg3r',
  'nigg4',
  'chink',
  'ch1nk',
  'spic',
  'sp1c',
  'kike',
  'k1ke',
  'wetback',
  'gook',
  'beaner',
  'towelhead',
  'raghead',
  'sandnigger',
  'sandnigga',
  'zipperhead',
  'coon', // racial slur (also a common word — we accept the false-positive cost for usernames)
  'jigaboo',
  'porch_monkey',
  'porchmonkey',
  'spook', // racial context
  'jungle_bunny',
  'junglebunny',
  'mud_person',
  'mudperson',
  'redskin',
  'halfbreed',
  'half_breed',
  'mulatto',
  'squaw',
  'injun',
  'abo',
  'pikey',
  'paki',
  'wop',
  'dago',
  'guinea',
  'mick', // Irish slur
  'polack',
  'hymie',
  'nip', // Japanese slur
  'slope',
  'charlie', // Viet slur
  'kraut',
  'nazi',
  'n4zi',
  'nazi',
  'white_power',
  'whitepower',
  'white_pride',
  'whitepride',
  'heil',
  'aryan',
  '1488',
  '88', // neo-nazi codes — blocked for usernames
  'faggot',
  'fagg0t',
  'fag',
  'dyke',
  'tranny',
  'retard',
  'ret4rd',
  'retarded',
  'spastic',
  'cripple',
  'mongoloid',
];

function buildPattern(words: string[]): RegExp {
  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/_/g, '[_\\s-]?'));
  return new RegExp(`(?<![a-z0-9])(${escaped.join('|')})(?![a-z0-9])`, 'i');
}

const USERNAME_BLOCKED_RE = buildPattern(BLOCKED_ALWAYS);
const CHAT_BLOCKED_RE = buildPattern(BLOCKED_ALWAYS);

export function containsBlockedUsername(username: string): boolean {
  return USERNAME_BLOCKED_RE.test(username);
}

export function containsBlockedChatWord(text: string): boolean {
  return CHAT_BLOCKED_RE.test(text);
}
