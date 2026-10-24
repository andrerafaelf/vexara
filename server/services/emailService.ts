import { randomBytes, randomUUID } from 'crypto';
import { Resend } from 'resend';
import prisma from '../lib/prisma.js';
import { logError, logWarn } from '../utils/logger.js';

const FROM = 'Vexara <hello@vexara.world>';
const REPLY_TO = 'support@vexara.world';
const SITE_URL = 'https://vexara.world';
const LOGO_URL = 'https://vexara.world/vexara-logo.png';
const DISCORD_URL = 'https://discord.gg/D858rzCHP7';
const KOFI_URL = 'https://ko-fi.com/andrerfferreira';
const UNSUBSCRIBE_URL = 'https://vexara.world/api/unsubscribe';
const SENDER_LOCATION = 'Funchal, Portugal';

let cached: Resend | null = null;
function client(): Resend {
	if (!cached) cached = new Resend(process.env.RESEND_API_KEY ?? '');
	return cached;
}

/** Logged once at boot (server.ts, after dotenv) so a missing key is visible, not silent. */
export function warnIfEmailNotConfigured(): void {
	if (!process.env.RESEND_API_KEY) {
		logError('email_not_configured', {
			message: 'RESEND_API_KEY is empty: all transactional email (verification, reset) will fail'
		});
	}
}

// First character of the local part plus the domain; never log a full address.
function maskEmail(email: string): string {
	const at = email.lastIndexOf('@');
	if (at < 1) return '***';
	return `${email[0]}***${email.slice(at)}`;
}

// Resend error names worth one more attempt: rate limit and server-side failures
// (the SDK reports network failures as application_error).
const RETRYABLE_RESEND_ERRORS = new Set([
	'rate_limit_exceeded',
	'application_error',
	'internal_server_error'
]);
const SEND_RETRY_DELAYS_MS = [1500]; // one retry

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function unsubscribeLinkFor(token: string): string {
	return `${UNSUBSCRIBE_URL}?token=${encodeURIComponent(token)}`;
}

/**
 * Look up (or mint) a per-recipient unsubscribe token. The token replaces the
 * old `?email=` lookup so an unsubscribe link only works for the address it
 * was issued to. The AlphaSignup row is the single source of truth for
 * email opt-outs (both alpha announcements and post-launch player emails), so
 * we upsert it on demand - registered players who never went through the
 * waitlist still get a working unsubscribe link.
 */
async function getOrCreateUnsubscribeToken(email: string): Promise<string> {
	const token = randomBytes(32).toString('hex');
	const row = await prisma.alphaSignup.upsert({
		where: { email },
		create: { email, source: 'user', unsubscribeToken: token },
		update: {},
		select: { unsubscribeToken: true }
	});
	if (row.unsubscribeToken) return row.unsubscribeToken;
	const updated = await prisma.alphaSignup.update({
		where: { email },
		data: { unsubscribeToken: token },
		select: { unsubscribeToken: true }
	});
	return updated.unsubscribeToken ?? token;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

interface LayoutOptions {
	preheader: string;
	bodyHtml: string;
	// Transactional emails (verify, reset) should not show an unsubscribe link.
	showUnsubscribe?: boolean;
	// Per-recipient unsubscribe token. When omitted (or null) the link is hidden.
	unsubscribeToken?: string | null;
}

function renderLayout({
	preheader,
	bodyHtml,
	showUnsubscribe = true,
	unsubscribeToken = null
}: LayoutOptions): string {
	const unsubBlock =
		showUnsubscribe && unsubscribeToken
			? `<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7180;">
                  <a href="${unsubscribeLinkFor(unsubscribeToken)}" style="color:#7aa2ff;text-decoration:underline;">Unsubscribe</a>
                </p>`
			: '';
	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark light">
  </head>
  <body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">${escapeHtml(preheader)}</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#0b0d12;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#11141b;border-radius:14px;overflow:hidden;">
            <tr>
              <td style="padding:32px 32px 8px;text-align:center;">
                <img src="${LOGO_URL}" alt="Vexara" width="56" height="56" style="display:inline-block;border:0;outline:none;text-decoration:none;border-radius:8px;">
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;">${bodyHtml}</td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #1c2230;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7180;">
                  You're receiving this because of activity at <a href="${SITE_URL}" style="color:#7aa2ff;text-decoration:none;">vexara.world</a>. If this wasn't you, you can safely ignore this email.
                </p>
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7180;">
                  Vexara &middot; ${SENDER_LOCATION}
                </p>
                ${unsubBlock}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function renderTextFooter(showUnsubscribe: boolean, unsubscribeToken?: string | null): string[] {
	const lines = [
		'',
		'---',
		`You're receiving this because of activity at ${SITE_URL}.`,
		"If this wasn't you, you can safely ignore this email.",
		'',
		`Vexara . ${SENDER_LOCATION}`
	];
	if (showUnsubscribe && unsubscribeToken) {
		lines.push(`Unsubscribe: ${unsubscribeLinkFor(unsubscribeToken)}`);
	}
	return lines;
}

function buttonHtml(href: string, label: string, color = '#5865f2'): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 20px;">
    <tr><td>
      <a href="${href}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`;
}

// ────────────────────────────────────────────────────────────────────────────
// Templates
// ────────────────────────────────────────────────────────────────────────────

interface RenderedEmail {
	subject: string;
	html: string;
	text: string;
	showUnsubscribe: boolean;
}

function tplAlphaWelcome(email: string, unsubscribeToken: string | null): RenderedEmail {
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">You're on the alpha list</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Thanks for joining. Vexara is a real-time strategy game where alliances, betrayals, and territory shape every galaxy you fight in.
    </p>
    <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">What happens next</h2>
    <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
      <li>We'll send everyone an invite link at the same time when alpha opens.</li>
      <li>Keep an eye on this inbox so you don't miss it.</li>
    </ul>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      In the meantime, join the Discord for bug reports, patch notes, and dev updates.
    </p>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a90a0;">
      Vexara runs on a small server during alpha. If you want to help keep it online, you can
      <a href="${KOFI_URL}" style="color:#7aa2ff;text-decoration:underline;">support the project on Ko-fi</a>.
      Supporters get a glowing name in-game.
    </p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#8a90a0;">Questions? Just reply to this email. It reaches a real person.</p>
  `;
	const text = [
		"You're on the Vexara alpha list",
		'',
		'Thanks for joining. Vexara is a real-time strategy game where alliances, betrayals, and territory shape every galaxy you fight in.',
		'',
		'What happens next:',
		"  - We'll send everyone an invite link at the same time when alpha opens.",
		"  - Keep an eye on this inbox so you don't miss it.",
		'',
		'In the meantime, join the Discord for bug reports, patch notes, and dev updates.',
		`Discord: ${DISCORD_URL}`,
		'',
		`Vexara runs on a small server during alpha. Support the project: ${KOFI_URL}`,
		'',
		'Questions? Just reply to this email. It reaches a real person.',
		...renderTextFooter(true, unsubscribeToken)
	].join('\n');
	void email;
	return {
		subject: "You're on the Vexara alpha list",
		html: renderLayout({
			preheader: "You're on the Vexara alpha list. We'll email you when alpha opens.",
			bodyHtml: body,
			unsubscribeToken
		}),
		text,
		showUnsubscribe: true
	};
}

function tplAlphaInviteAnnouncement(email: string, unsubscribeToken: string | null): RenderedEmail {
	const registerUrl = `${SITE_URL}/register`;
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Alpha starts Saturday. Registration is open now.</h1>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      You're on the waitlist, so you get to know first.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px;width:100%;">
      <tr>
        <td style="padding:16px 20px;background:#0b0d12;border:1px solid #1c2230;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#8a90a0;margin-bottom:6px;">Alpha opens</div>
          <div style="font-size:20px;font-weight:700;color:#ffffff;margin-bottom:4px;">Saturday, 23 May 2026 at 15:30 UTC</div>
          <div style="font-size:13px;color:#8a90a0;">16:30 Lisbon &nbsp;&middot;&nbsp; 17:30 Paris &nbsp;&middot;&nbsp; 11:30 New York &nbsp;&middot;&nbsp; 08:30 Los Angeles</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Registration is open now. Create your account before Saturday and you will be ready to play the moment alpha goes live. The first players in get the founder&apos;s badge and a permanent leaderboard mark.
    </p>
    <div style="text-align:center;">${buttonHtml(registerUrl, 'Create your account', '#3b82f6')}</div>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#8a90a0;">
      If a friend gave you their referral code, enter it at signup. You don&apos;t need one to play.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Join the Discord for launch updates, bug reports, and strategy talk.
    </p>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#8a90a0;">Questions? Just reply to this email. It reaches a real person.</p>
  `;
	const text = [
		'Vexara alpha starts Saturday, 23 May 2026. Registration is open now.',
		'',
		"You're on the waitlist, so you get to know first.",
		'',
		'Alpha opens: Saturday, 23 May 2026 at 15:30 UTC',
		'16:30 Lisbon · 17:30 Paris · 11:30 New York · 08:30 Los Angeles',
		'',
		"Registration is open now. Create your account before Saturday and you will be ready to play the moment alpha goes live. The first players in get the founder's badge and a permanent leaderboard mark.",
		'',
		`Create your account: ${registerUrl}`,
		'',
		"If a friend gave you their referral code, enter it at signup. You don't need one to play.",
		'',
		'Join the Discord for launch updates, bug reports, and strategy talk.',
		`Discord: ${DISCORD_URL}`,
		'',
		'Questions? Just reply to this email. It reaches a real person.',
		...renderTextFooter(true, unsubscribeToken)
	].join('\n');
	void email;
	return {
		subject: 'Vexara alpha starts Saturday at 15:30 UTC',
		html: renderLayout({
			preheader:
				'Registration is open now. Alpha goes live Saturday, 23 May at 15:30 UTC. Founder badges for the first players in.',
			bodyHtml: body,
			unsubscribeToken
		}),
		text,
		showUnsubscribe: true
	};
}

function tplGalaxyLive(
	email: string,
	unsubscribeToken: string | null,
	displayName?: string
): RenderedEmail {
	const playUrl = `${SITE_URL}/galaxies`;
	const greeting = displayName ? `Commander ${escapeHtml(displayName)},` : 'Commander,';
	const body = `
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7aa2ff;font-weight:700;">// Transmission inbound</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">The galaxy is live.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      ${greeting}
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      The stars are open. Alliances are forming as you read this. Every minute you wait, someone else is claiming a nexus, drawing borders, and writing the early history of this galaxy.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px;width:100%;">
      <tr>
        <td style="padding:18px 22px;background:#0b0d12;border:1px solid #1c2230;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7aa2ff;margin-bottom:8px;font-weight:700;">// Status</div>
          <div style="font-size:22px;font-weight:700;color:#ffffff;margin-bottom:4px;">Galaxy online &mdash; ${escapeHtml('23 May 2026, 15:30 UTC')}</div>
          <div style="font-size:13px;color:#8a90a0;">Founder badges are minting for the first players in.</div>
        </td>
      </tr>
    </table>
    <div style="text-align:center;">${buttonHtml(playUrl, 'Enter the galaxy', '#3b82f6')}</div>
    <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">First moves matter</h2>
    <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
      <li>Claim your starting nexus before the map fills around you.</li>
      <li>Build the Command Core early &mdash; it accelerates every upgrade that follows.</li>
      <li>Scout neighbours before you strike. Recon is cheaper than a wiped fleet.</li>
      <li>Find a faction. Galaxies are won by groups, not lone commanders.</li>
    </ul>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      The Discord is where launch coordination, bug reports, and strategy talk are happening right now.
    </p>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
    <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a90a0;">
      Vexara is running on a single small server during alpha. If you want to help keep it online, you can
      <a href="${KOFI_URL}" style="color:#7aa2ff;text-decoration:underline;">support the project on Ko-fi</a>.
      Supporters get a glowing name in-game.
    </p>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#8a90a0;">See you in the dark. Questions? Just reply to this email &mdash; it reaches a real person.</p>
  `;
	const text = [
		'The galaxy is live.',
		'',
		displayName ? `Commander ${displayName},` : 'Commander,',
		'',
		'The stars are open. Alliances are forming as you read this. Every minute you wait, someone else is claiming a nexus, drawing borders, and writing the early history of this galaxy.',
		'',
		'Status: Galaxy online - 23 May 2026, 15:30 UTC',
		'Founder badges are minting for the first players in.',
		'',
		`Enter the galaxy: ${playUrl}`,
		'',
		'First moves matter:',
		'  - Claim your starting nexus before the map fills around you.',
		'  - Build the Command Core early - it accelerates every upgrade that follows.',
		'  - Scout neighbours before you strike. Recon is cheaper than a wiped fleet.',
		'  - Find a faction. Galaxies are won by groups, not lone commanders.',
		'',
		`Discord: ${DISCORD_URL}`,
		'',
		`Support the project on Ko-fi: ${KOFI_URL}`,
		'',
		'See you in the dark. Questions? Just reply to this email - it reaches a real person.',
		...renderTextFooter(true, unsubscribeToken)
	].join('\n');
	void email;
	return {
		subject: 'The galaxy is live. Enter now.',
		html: renderLayout({
			preheader: 'Vexara is open. Claim your nexus before the map fills around you.',
			bodyHtml: body,
			unsubscribeToken
		}),
		text,
		showUnsubscribe: true
	};
}

function tplVerifyEmail(email: string, username: string, verifyUrl: string): RenderedEmail {
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Confirm your email</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Welcome, ${escapeHtml(username)}. Click the button below to confirm this email address and activate your Vexara account.
    </p>
    <div style="text-align:center;">${buttonHtml(verifyUrl, 'Confirm email')}</div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8a90a0;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7aa2ff;word-break:break-all;">${verifyUrl}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8a90a0;">This link expires in 24 hours. If you didn't sign up for Vexara, you can ignore this email.</p>
  `;
	const text = [
		'Confirm your email',
		'',
		`Welcome, ${username}. Confirm this email address to activate your Vexara account.`,
		'',
		`Confirm: ${verifyUrl}`,
		'',
		"This link expires in 24 hours. If you didn't sign up for Vexara, you can ignore this email.",
		...renderTextFooter(false)
	].join('\n');
	void email;
	return {
		subject: 'Confirm your Vexara email',
		html: renderLayout({
			preheader: 'Confirm your email to activate your Vexara account.',
			bodyHtml: body,
			showUnsubscribe: false
		}),
		text,
		showUnsubscribe: false
	};
}

function tplWelcome(
	email: string,
	username: string,
	referralCode: string,
	unsubscribeToken: string | null
): RenderedEmail {
	const playUrl = `${SITE_URL}/galaxies`;
	const inviteUrl = `${SITE_URL}/register?ref=${encodeURIComponent(referralCode)}`;
	const safeCode = escapeHtml(referralCode);
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Welcome to Vexara, ${escapeHtml(username)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Your account is active. Pick a galaxy, claim your first nexus, and start building.
    </p>
    <div style="text-align:center;">${buttonHtml(playUrl, 'Enter the game', '#3b82f6')}</div>

    <h2 style="margin:28px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">Invite your friends</h2>
    <p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      This is your personal referral code. Share it with friends &mdash; when they reach 1,000 influence points, you earn 2 reward tokens redeemable for instant building levels or troop grants.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px;width:100%;">
      <tr>
        <td align="center" style="padding:14px 16px;background:#0b0d12;border:1px solid #1c2230;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#8a90a0;margin-bottom:6px;">Your referral code</div>
          <div style="font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:22px;font-weight:700;letter-spacing:0.18em;color:#ffffff;">${safeCode}</div>
        </td>
      </tr>
    </table>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#c8ccd6;">
      Or send friends this one-click invite link:
    </p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7aa2ff;word-break:break-all;">
      <a href="${inviteUrl}" style="color:#7aa2ff;text-decoration:underline;">${inviteUrl}</a>
    </p>
    <p style="margin:0 0 20px;font-size:13px;line-height:1.6;color:#8a90a0;">
      The link pre-fills the referral field at signup, so they don't have to type anything.
    </p>

    <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">A few pointers</h2>
    <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
      <li>Build your Command Core early &mdash; it speeds up every upgrade you queue afterwards.</li>
      <li>Scout before you strike. A Recon Operative is cheaper than a wiped fleet.</li>
      <li>Hit a bug or want to talk strategy? The Discord is the place.</li>
    </ul>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
    <p style="margin:0;font-size:14px;line-height:1.6;color:#8a90a0;">Questions? Just reply to this email. It reaches a real person.</p>
  `;
	const text = [
		`Welcome to Vexara, ${username}`,
		'',
		'Your account is active. Pick a galaxy, claim your first nexus, and start building.',
		'',
		`Enter the game: ${playUrl}`,
		'',
		'Invite your friends',
		`Your referral code: ${referralCode}`,
		`Invite link: ${inviteUrl}`,
		'When a friend you referred reaches 1,000 influence points, you earn 2 reward tokens',
		'redeemable for instant building levels or troop grants.',
		'',
		'A few pointers:',
		'  - Build your Command Core early - it speeds up every upgrade you queue afterwards.',
		'  - Scout before you strike. A Recon Operative is cheaper than a wiped fleet.',
		'  - Hit a bug or want to talk strategy? The Discord is the place.',
		'',
		`Discord: ${DISCORD_URL}`,
		'',
		'Questions? Just reply to this email. It reaches a real person.',
		...renderTextFooter(true, unsubscribeToken)
	].join('\n');
	void email;
	return {
		subject: 'Welcome to Vexara',
		html: renderLayout({
			preheader: 'Your Vexara account is active. Enter the game and claim your first nexus.',
			bodyHtml: body,
			unsubscribeToken
		}),
		text,
		showUnsubscribe: true
	};
}

function tplPasswordChanged(email: string, username: string): RenderedEmail {
	const resetUrl = `${SITE_URL}/forgot-password`;
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Your password was changed</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Hi ${escapeHtml(username)}, the password for your Vexara account was just changed successfully.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      If you made this change, no further action is needed.
    </p>
    <p style="margin:0 0 8px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      If you didn't do this, your account may be compromised. Reset your password immediately:
    </p>
    <div style="text-align:center;">${buttonHtml(resetUrl, 'Reset password now', '#ef4444')}</div>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8a90a0;">If you have any questions, reply to this email - it reaches a real person.</p>
  `;
	const text = [
		'Your Vexara password was changed',
		'',
		`Hi ${username}, the password for your Vexara account was just changed successfully.`,
		'',
		'If you made this change, no further action is needed.',
		'',
		"If you didn't do this, your account may be compromised. Reset your password immediately:",
		`Reset: ${resetUrl}`,
		'',
		'If you have any questions, reply to this email - it reaches a real person.',
		...renderTextFooter(false)
	].join('\n');
	void email;
	return {
		subject: 'Your Vexara password was changed',
		html: renderLayout({
			preheader: "Your Vexara password was just changed. If this wasn't you, reset it immediately.",
			bodyHtml: body,
			showUnsubscribe: false
		}),
		text,
		showUnsubscribe: false
	};
}

function tplPasswordReset(email: string, username: string, resetUrl: string): RenderedEmail {
	const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Reset your password</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Hi ${escapeHtml(username)}, we got a request to reset the password for your Vexara account. Click the button below to set a new one.
    </p>
    <div style="text-align:center;">${buttonHtml(resetUrl, 'Reset password')}</div>
    <p style="margin:0 0 8px;font-size:13px;line-height:1.6;color:#8a90a0;">Or copy and paste this link into your browser:</p>
    <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#7aa2ff;word-break:break-all;">${resetUrl}</p>
    <p style="margin:0;font-size:13px;line-height:1.6;color:#8a90a0;">This link expires in 1 hour. If you didn't ask for a password reset, you can ignore this email. Your password will not change.</p>
  `;
	const text = [
		'Reset your Vexara password',
		'',
		`Hi ${username}, we got a request to reset the password for your Vexara account.`,
		'',
		`Reset: ${resetUrl}`,
		'',
		"This link expires in 1 hour. If you didn't ask for a password reset, you can ignore this email. Your password will not change.",
		...renderTextFooter(false)
	].join('\n');
	void email;
	return {
		subject: 'Reset your Vexara password',
		html: renderLayout({
			preheader: 'Reset your Vexara password. Link expires in 1 hour.',
			bodyHtml: body,
			showUnsubscribe: false
		}),
		text,
		showUnsubscribe: false
	};
}

// ────────────────────────────────────────────────────────────────────────────
// Send helpers (caller-facing API)
// ────────────────────────────────────────────────────────────────────────────

async function send(
	to: string,
	rendered: RenderedEmail,
	unsubscribeToken: string | null,
	kind: string
): Promise<void> {
	const headers: Record<string, string> = {};
	if (rendered.showUnsubscribe && unsubscribeToken) {
		headers['List-Unsubscribe'] =
			`<${unsubscribeLinkFor(unsubscribeToken)}>, <mailto:unsubscribe@vexara.world>`;
		headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
	}
	const payload = {
		from: FROM,
		to: [to],
		replyTo: REPLY_TO,
		subject: rendered.subject,
		html: rendered.html,
		text: rendered.text,
		headers
	};

	// One key per logical send, reused across retries: if a first attempt actually
	// delivered but the response was lost, Resend dedupes the retry instead of mailing twice.
	const idempotencyKey = randomUUID();

	// The Resend SDK resolves with { data, error } for API failures (bad key,
	// unverified domain, quota, 429) instead of throwing, so the result must be
	// checked or the mail silently vanishes.
	for (let attempt = 0; ; attempt++) {
		let errName = 'send_threw';
		let errMessage = '';
		try {
			const { error } = await client().emails.send(payload, { idempotencyKey });
			if (!error) return;
			errName = error.name;
			errMessage = error.message;
		} catch (err) {
			errMessage = (err as Error).message;
		}

		const retryDelay = SEND_RETRY_DELAYS_MS[attempt];
		const retryable = errName === 'send_threw' || RETRYABLE_RESEND_ERRORS.has(errName);
		if (retryable && retryDelay !== undefined) {
			logWarn('email_send_retry', { kind, to: maskEmail(to), errName, errMessage });
			await sleep(retryDelay);
			continue;
		}
		logError('email_send_failed', { kind, to: maskEmail(to), errName, errMessage });
		throw new Error(`Email send failed (${kind}): ${errName}: ${errMessage}`);
	}
}

export async function sendAlphaWelcome(email: string): Promise<void> {
	const token = await getOrCreateUnsubscribeToken(email);
	await send(email, tplAlphaWelcome(email, token), token, 'alpha_welcome');
}

export async function sendAlphaInviteAnnouncement(email: string): Promise<void> {
	const token = await getOrCreateUnsubscribeToken(email);
	await send(email, tplAlphaInviteAnnouncement(email, token), token, 'alpha_invite');
}

export async function sendGalaxyLive(email: string, displayName?: string): Promise<void> {
	const token = await getOrCreateUnsubscribeToken(email);
	await send(email, tplGalaxyLive(email, token, displayName), token, 'galaxy_live');
}

function tplGalaxyAlert(
	email: string,
	unsubscribeToken: string | null,
	galaxyName: string,
	startsAt: Date,
	displayName?: string
): RenderedEmail {
	const playUrl = `${SITE_URL}/galaxies`;
	const greeting = displayName ? `Commander ${escapeHtml(displayName)},` : 'Commander,';

	const dateStr = startsAt.toUTCString().replace(' GMT', ' UTC');

	const zones = [
		{ label: 'UTC', tz: 'UTC' },
		{ label: 'Lisbon', tz: 'Europe/Lisbon' },
		{ label: 'Paris', tz: 'Europe/Paris' },
		{ label: 'New York', tz: 'America/New_York' },
		{ label: 'Los Angeles', tz: 'America/Los_Angeles' }
	]
		.map(({ label, tz }) => {
			const t = new Intl.DateTimeFormat('en-GB', {
				hour: '2-digit',
				minute: '2-digit',
				hour12: false,
				timeZone: tz
			}).format(startsAt);
			return `${t} ${label}`;
		})
		.join(' &middot; ');

	const body = `
    <p style="margin:0 0 8px;font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#7aa2ff;font-weight:700;">// Transmission inbound</p>
    <h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;color:#ffffff;font-weight:700;letter-spacing:-0.01em;">${escapeHtml(galaxyName)} goes live soon.</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">${greeting}</p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      You asked us to let you know. ${escapeHtml(galaxyName)} opens shortly &mdash; be ready to claim your nexus before the borders fill in around you.
    </p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 24px;width:100%;">
      <tr>
        <td style="padding:18px 22px;background:#0b0d12;border:1px solid #1c2230;border-radius:10px;">
          <div style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7aa2ff;margin-bottom:8px;font-weight:700;">// Launch Window</div>
          <div style="font-size:20px;font-weight:700;color:#ffffff;margin-bottom:6px;">${escapeHtml(dateStr)}</div>
          <div style="font-size:12px;color:#8a90a0;">${zones}</div>
        </td>
      </tr>
    </table>
    <div style="text-align:center;">${buttonHtml(playUrl, 'Enter the galaxy', '#3b82f6')}</div>
    <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">First moves matter</h2>
    <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
      <li>Claim your starting nexus before the map fills around you.</li>
      <li>Build the Command Core early &mdash; it accelerates every upgrade that follows.</li>
      <li>Scout neighbours before you strike. Recon is cheaper than a wiped fleet.</li>
      <li>Find a faction. Galaxies are won by groups, not lone commanders.</li>
    </ul>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
    <p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#8a90a0;">See you in the dark. Questions? Just reply to this email &mdash; it reaches a real person.</p>
  `;
	const text = [
		`${galaxyName} goes live soon.`,
		'',
		displayName ? `Commander ${displayName},` : 'Commander,',
		'',
		`You asked us to let you know. ${galaxyName} opens shortly.`,
		'',
		`Launch: ${dateStr}`,
		'',
		`Enter the galaxy: ${playUrl}`,
		'',
		'First moves matter:',
		'  - Claim your starting nexus before the map fills around you.',
		'  - Build the Command Core early.',
		'  - Scout neighbours before you strike.',
		'  - Find a faction.',
		'',
		`Discord: ${DISCORD_URL}`,
		'',
		'See you in the dark. Questions? Just reply to this email.',
		...renderTextFooter(true, unsubscribeToken)
	].join('\n');
	void email;
	return {
		subject: `${galaxyName} opens soon — be ready`,
		html: renderLayout({
			preheader: `${galaxyName} is about to go live. Claim your nexus before the borders fill in.`,
			bodyHtml: body,
			unsubscribeToken
		}),
		text,
		showUnsubscribe: true
	};
}

export async function sendGalaxyAlert(
	email: string,
	galaxyName: string,
	startsAt: Date,
	displayName?: string
): Promise<void> {
	const token = await getOrCreateUnsubscribeToken(email);
	await send(
		email,
		tplGalaxyAlert(email, token, galaxyName, startsAt, displayName),
		token,
		'galaxy_alert'
	);
}

export async function sendVerifyEmail(
	email: string,
	username: string,
	token: string
): Promise<void> {
	const verifyUrl = `${SITE_URL}/verify-email?token=${encodeURIComponent(token)}`;
	await send(email, tplVerifyEmail(email, username, verifyUrl), null, 'verify_email');
}

export async function sendWelcome(
	email: string,
	username: string,
	referralCode: string
): Promise<void> {
	const token = await getOrCreateUnsubscribeToken(email);
	await send(email, tplWelcome(email, username, referralCode, token), token, 'welcome');
}

export async function sendPasswordReset(
	email: string,
	username: string,
	token: string
): Promise<void> {
	const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
	await send(email, tplPasswordReset(email, username, resetUrl), null, 'password_reset');
}

export async function sendPasswordChanged(email: string, username: string): Promise<void> {
	await send(email, tplPasswordChanged(email, username), null, 'password_changed');
}
