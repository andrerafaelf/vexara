import { Resend } from 'resend';

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

function unsubscribeLinkFor(email: string): string {
  return `${UNSUBSCRIBE_URL}?email=${encodeURIComponent(email)}`;
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
  recipientEmail: string;
  preheader: string;
  bodyHtml: string;
  // Transactional emails (verify, reset) should not show an unsubscribe link.
  showUnsubscribe?: boolean;
}

function renderLayout({ recipientEmail, preheader, bodyHtml, showUnsubscribe = true }: LayoutOptions): string {
  const unsubBlock = showUnsubscribe
    ? `<p style="margin:0;font-size:12px;line-height:1.6;color:#6b7180;">
                  <a href="${unsubscribeLinkFor(recipientEmail)}" style="color:#7aa2ff;text-decoration:underline;">Unsubscribe</a>
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

function renderTextFooter(recipientEmail: string, showUnsubscribe: boolean): string[] {
  const lines = [
    '',
    '---',
    `You're receiving this because of activity at ${SITE_URL}.`,
    "If this wasn't you, you can safely ignore this email.",
    '',
    `Vexara . ${SENDER_LOCATION}`,
  ];
  if (showUnsubscribe) {
    lines.push(`Unsubscribe: ${unsubscribeLinkFor(recipientEmail)}`);
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

function tplAlphaWelcome(email: string): RenderedEmail {
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
    ...renderTextFooter(email, true),
  ].join('\n');
  return {
    subject: "You're on the Vexara alpha list",
    html: renderLayout({ recipientEmail: email, preheader: "You're on the Vexara alpha list. We'll email you when alpha opens.", bodyHtml: body }),
    text,
    showUnsubscribe: true,
  };
}

function tplAlphaInviteAnnouncement(email: string): RenderedEmail {
  const registerUrl = `${SITE_URL}/register`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Alpha is open</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      You're getting this first because you signed up to the waitlist. Vexara is now open. Come create your account and start your first galaxy.
    </p>
    <div style="text-align:center;">${buttonHtml(registerUrl, 'Create your account', '#3b82f6')}</div>
    <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#8a90a0;">
      Tip: a friend can give you their referral code at signup. You don't need one to play.
    </p>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Join the Discord for bug reports, patch notes, and dev updates.
    </p>
    <div style="text-align:center;">${buttonHtml(DISCORD_URL, 'Join the Discord')}</div>
  `;
  const text = [
    'Alpha is open',
    '',
    "You're getting this first because you signed up to the waitlist. Vexara is now open. Come create your account and start your first galaxy.",
    '',
    `Create your account: ${registerUrl}`,
    '',
    "Tip: a friend can give you their referral code at signup. You don't need one to play.",
    '',
    'Join the Discord for bug reports, patch notes, and dev updates.',
    `Discord: ${DISCORD_URL}`,
    ...renderTextFooter(email, true),
  ].join('\n');
  return {
    subject: 'Vexara alpha is open',
    html: renderLayout({ recipientEmail: email, preheader: 'Vexara alpha is open. Create your account and start your first galaxy.', bodyHtml: body }),
    text,
    showUnsubscribe: true,
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
    ...renderTextFooter(email, false),
  ].join('\n');
  return {
    subject: 'Confirm your Vexara email',
    html: renderLayout({ recipientEmail: email, preheader: 'Confirm your email to activate your Vexara account.', bodyHtml: body, showUnsubscribe: false }),
    text,
    showUnsubscribe: false,
  };
}

function tplWelcome(email: string, username: string): RenderedEmail {
  const playUrl = `${SITE_URL}/galaxies`;
  const body = `
    <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">Welcome to Vexara, ${escapeHtml(username)}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
      Your account is active. Pick a galaxy, claim your first nexus, and start building.
    </p>
    <div style="text-align:center;">${buttonHtml(playUrl, 'Enter the game', '#3b82f6')}</div>
    <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">A few pointers</h2>
    <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
      <li>Found a friend? Share your referral code from the Referrals page.</li>
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
    'A few pointers:',
    '  - Found a friend? Share your referral code from the Referrals page.',
    '  - Hit a bug or want to talk strategy? The Discord is the place.',
    '',
    `Discord: ${DISCORD_URL}`,
    '',
    'Questions? Just reply to this email. It reaches a real person.',
    ...renderTextFooter(email, true),
  ].join('\n');
  return {
    subject: 'Welcome to Vexara',
    html: renderLayout({ recipientEmail: email, preheader: 'Your Vexara account is active. Enter the game and claim your first nexus.', bodyHtml: body }),
    text,
    showUnsubscribe: true,
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
    ...renderTextFooter(email, false),
  ].join('\n');
  return {
    subject: 'Reset your Vexara password',
    html: renderLayout({ recipientEmail: email, preheader: 'Reset your Vexara password. Link expires in 1 hour.', bodyHtml: body, showUnsubscribe: false }),
    text,
    showUnsubscribe: false,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Send helpers (caller-facing API)
// ────────────────────────────────────────────────────────────────────────────

async function send(to: string, rendered: RenderedEmail): Promise<void> {
  const headers: Record<string, string> = {};
  if (rendered.showUnsubscribe) {
    headers['List-Unsubscribe'] = `<${unsubscribeLinkFor(to)}>, <mailto:unsubscribe@vexara.world>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }
  await client().emails.send({
    from: FROM,
    to: [to],
    replyTo: REPLY_TO,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    headers,
  });
}

export async function sendAlphaWelcome(email: string): Promise<void> {
  await send(email, tplAlphaWelcome(email));
}

export async function sendAlphaInviteAnnouncement(email: string): Promise<void> {
  await send(email, tplAlphaInviteAnnouncement(email));
}

export async function sendVerifyEmail(email: string, username: string, token: string): Promise<void> {
  const verifyUrl = `${SITE_URL}/verify-email?token=${encodeURIComponent(token)}`;
  await send(email, tplVerifyEmail(email, username, verifyUrl));
}

export async function sendWelcome(email: string, username: string): Promise<void> {
  await send(email, tplWelcome(email, username));
}

export async function sendPasswordReset(email: string, username: string, token: string): Promise<void> {
  const resetUrl = `${SITE_URL}/reset-password?token=${encodeURIComponent(token)}`;
  await send(email, tplPasswordReset(email, username, resetUrl));
}
