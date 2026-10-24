// Single source of truth for the Vex Pass reward table on the client.
// Mirrors server/utils/battlePass.ts (REWARD_TABLE and the PASS_* constants)
// exactly. The server stays authoritative for runtime grants; this copy drives
// the in-game modal and the public landing page so they can never drift from
// each other again. The pass is permanent and account-wide (no seasons).
//
// Reward format strings (parsed by fmtPassReward / VexPassModal.fmtReward):
//   resources:<biomass>:<alloy>:<ore>   - all three deposited to selected nexus
//   boost:production:<pct>:<hours>       - time-limited production multiplier
//   title:<Name>                         - permanent prestige title
//   badge:<tier>                         - permanent career badge
//   vexpoints:<amount>                   - credited to User.vexPoints
//   token:<count>                        - supporter / milestone tokens

export const MAX_PASS_LEVEL = 50;
export const XP_PER_LEVEL = 200;
export const PASS_COST_VP = 1000;

// Repeatable cache granted for every 200 XP past L50 (same on free and paid).
export const PASS_CACHE_REWARD = 'resources:50000:50000:50000';
// Max unclaimed caches that can be banked.
export const PASS_CACHE_BANK_CAP = 10;
// Max pass XP an account can earn per UTC day.
export const PASS_DAILY_XP_CAP = 800;
// Claim pacing per galaxy: levels 1-10 open right away, then 4 more per day.
// Caches unlock once the allowance reaches level 50.
export const PASS_PACING_BASE_LEVELS = 10;
export const PASS_PACING_LEVELS_PER_DAY = 4;
export const PASS_CACHE_PACING_LEVEL = 50;
// A claim is refused if more than this fraction of any resource would not fit.
export const PASS_CLAIM_WASTE_TOLERANCE = 0.05;

export interface PassLevel {
	level: number;
	free: string | null;
	paid: string | null;
}

export const PASS_LEVELS: PassLevel[] = [
	// Act I: Enlistment (1–10)
	{ level: 1, free: 'resources:500:500:500', paid: 'title:Conscript' },
	{ level: 2, free: 'resources:800:800:800', paid: 'boost:production:5:12' },
	{ level: 3, free: 'resources:1000:1000:1000', paid: 'vexpoints:10' },
	{ level: 4, free: 'resources:1200:1200:1200', paid: 'boost:production:8:18' },
	{ level: 5, free: 'resources:1500:1500:1500,vexpoints:10', paid: 'vexpoints:10' },
	{ level: 6, free: 'resources:2000:2000:2000', paid: 'boost:production:10:24' },
	{ level: 7, free: 'resources:2500:2500:2500', paid: 'boost:production:10:24' },
	{ level: 8, free: 'resources:3000:3000:3000', paid: 'title:Operative,vexpoints:10' },
	{ level: 9, free: 'resources:3500:3500:3500', paid: 'boost:production:12:24' },
	{ level: 10, free: 'badge:bronze,resources:4000:4000:4000,vexpoints:20', paid: 'vexpoints:15,boost:production:12:36' },
	// Act II: Field Ops (11–20)
	{ level: 11, free: 'resources:5000:5000:5000', paid: 'boost:production:15:36' },
	{ level: 12, free: 'resources:6000:6000:6000', paid: 'boost:production:15:36' },
	{ level: 13, free: 'resources:7000:7000:7000', paid: 'vexpoints:10' },
	{ level: 14, free: 'resources:8000:8000:8000', paid: 'boost:production:15:48' },
	{ level: 15, free: 'resources:9000:9000:9000,vexpoints:20', paid: 'vexpoints:15' },
	{ level: 16, free: 'resources:10000:10000:10000', paid: 'boost:production:18:48' },
	{ level: 17, free: 'resources:11000:11000:11000', paid: 'boost:production:18:48' },
	{ level: 18, free: 'resources:12000:12000:12000', paid: 'title:Proven,vexpoints:15' },
	{ level: 19, free: 'resources:13000:13000:13000', paid: 'boost:production:20:48' },
	{ level: 20, free: 'resources:15000:15000:15000,vexpoints:25', paid: 'vexpoints:20,boost:production:20:72,token:1' },
	// Act III: Warfront (21–30)
	{ level: 21, free: 'resources:17000:17000:17000', paid: 'boost:production:22:72' },
	{ level: 22, free: 'resources:19000:19000:19000', paid: 'boost:production:22:72' },
	{ level: 23, free: 'resources:21000:21000:21000', paid: 'vexpoints:15' },
	{ level: 24, free: 'resources:23000:23000:23000', paid: 'boost:production:22:72' },
	{ level: 25, free: 'badge:silver,resources:25000:25000:25000,vexpoints:25', paid: 'vexpoints:20' },
	{ level: 26, free: 'resources:27000:27000:27000', paid: 'boost:production:25:72' },
	{ level: 27, free: 'resources:29000:29000:29000', paid: 'boost:production:25:72' },
	{ level: 28, free: 'resources:31000:31000:31000', paid: 'vexpoints:15' },
	{ level: 29, free: 'resources:34000:34000:34000', paid: 'boost:production:25:96' },
	{ level: 30, free: 'resources:37000:37000:37000,vexpoints:30', paid: 'title:Vex Commander,vexpoints:25,boost:production:25:96' },
	// Act IV: High Command (31–40)
	{ level: 31, free: 'resources:40000:40000:40000', paid: 'boost:production:28:96' },
	{ level: 32, free: 'resources:43000:43000:43000', paid: 'boost:production:28:96' },
	{ level: 33, free: 'resources:46000:46000:46000', paid: 'vexpoints:15' },
	{ level: 34, free: 'resources:50000:50000:50000', paid: 'boost:production:28:96' },
	{ level: 35, free: 'resources:54000:54000:54000,vexpoints:30', paid: 'vexpoints:25,token:1' },
	{ level: 36, free: 'resources:58000:58000:58000', paid: 'boost:production:30:96' },
	{ level: 37, free: 'resources:62000:62000:62000', paid: 'boost:production:30:96' },
	{ level: 38, free: 'resources:66000:66000:66000', paid: 'vexpoints:20' },
	{ level: 39, free: 'resources:70000:70000:70000', paid: 'boost:production:30:120' },
	{ level: 40, free: 'badge:gold,title:Veteran,resources:75000:75000:75000,vexpoints:35', paid: 'vexpoints:30,boost:production:30:120' },
	// Act V: The Vex Reckoning (41–50)
	{ level: 41, free: 'resources:80000:80000:80000', paid: 'boost:production:32:120' },
	{ level: 42, free: 'resources:85000:85000:85000', paid: 'boost:production:32:120' },
	{ level: 43, free: 'resources:90000:90000:90000', paid: 'vexpoints:20' },
	{ level: 44, free: 'resources:95000:95000:95000', paid: 'boost:production:33:120' },
	{ level: 45, free: 'resources:100000:100000:100000,vexpoints:35', paid: 'title:High Commander,vexpoints:35,boost:production:33:120' },
	{ level: 46, free: 'resources:110000:110000:110000', paid: 'boost:production:35:120' },
	{ level: 47, free: 'resources:120000:120000:120000', paid: 'boost:production:35:120' },
	{ level: 48, free: 'resources:130000:130000:130000', paid: 'vexpoints:25' },
	{ level: 49, free: 'resources:140000:140000:140000', paid: 'boost:production:35:120' },
	{ level: 50, free: 'badge:platinum,vexpoints:20', paid: 'title:Protocol Ascendant,vexpoints:170,token:4,boost:production:35:120' }
];

export const PASS_ACT_LABELS: Record<number, string> = {
	1: 'Act I: Enlistment',
	11: 'Act II: Field Operations',
	21: 'Act III: Warfront',
	31: 'Act IV: High Command',
	41: 'Act V: Final Offensive'
};
