import { Resend } from 'resend';

const FROM = 'Vexara <hello@vexara.world>';
const REPLY_TO = 'support@vexara.world';
const SITE_URL = 'https://vexara.world';
const LOGO_URL = 'https://vexara.world/vexara-logo.png';
const DISCORD_URL = 'https://discord.gg/D858rzCHP7';
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

function alphaWelcomeHtml(email: string): string {
  const unsubUrl = unsubscribeLinkFor(email);
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <meta name="color-scheme" content="dark light">
    <title>You're on the Vexara alpha list</title>
  </head>
  <body style="margin:0;padding:0;background:#0b0d12;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <span style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all;">
      You're on the Vexara alpha list. We'll email you when the next batch of slots opens.
    </span>
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
              <td style="padding:8px 32px 0;">
                <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:#ffffff;font-weight:600;">You're on the alpha list</h1>
                <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#c8ccd6;">
                  Thanks for joining. Vexara is a real-time strategy game where alliances, betrayals, and territory shape every galaxy you fight in &mdash; and we're opening it up slowly so the early community shapes how it plays.
                </p>
                <h2 style="margin:24px 0 12px;font-size:15px;line-height:1.4;color:#ffffff;font-weight:600;">What happens next</h2>
                <ul style="margin:0 0 16px;padding:0 0 0 20px;font-size:15px;line-height:1.7;color:#c8ccd6;">
                  <li>We're inviting alpha players in small batches over the coming weeks.</li>
                  <li>You'll get a separate email with your invite link when a slot opens for you.</li>
                  <li>Want to jump the queue? Join Discord below &mdash; active members get priority.</li>
                </ul>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 24px;text-align:center;">
                <a href="${DISCORD_URL}" style="display:inline-block;background:#5865f2;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-size:15px;font-weight:600;">
                  Join the Discord
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px;">
                <p style="margin:0;font-size:14px;line-height:1.6;color:#8a90a0;">
                  Questions? Just reply to this email &mdash; it reaches a real person.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 28px;border-top:1px solid #1c2230;">
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7180;">
                  You're receiving this because you joined the alpha waitlist at <a href="${SITE_URL}" style="color:#7aa2ff;text-decoration:none;">vexara.world</a>. If this wasn't you, you can safely ignore this email.
                </p>
                <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:#6b7180;">
                  Vexara &middot; ${SENDER_LOCATION}
                </p>
                <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7180;">
                  <a href="${unsubUrl}" style="color:#7aa2ff;text-decoration:underline;">Unsubscribe</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

function alphaWelcomeText(email: string): string {
  const unsubUrl = unsubscribeLinkFor(email);
  return [
    "You're on the Vexara alpha list",
    '',
    "Thanks for joining. Vexara is a real-time strategy game where alliances, betrayals, and territory shape every galaxy you fight in — and we're opening it up slowly so the early community shapes how it plays.",
    '',
    'What happens next:',
    "  - We're inviting alpha players in small batches over the coming weeks.",
    "  - You'll get a separate email with your invite link when a slot opens for you.",
    '  - Want to jump the queue? Join Discord — active members get priority.',
    '',
    `Join the Discord: ${DISCORD_URL}`,
    '',
    'Questions? Just reply to this email — it reaches a real person.',
    '',
    '---',
    `You're receiving this because you joined the alpha waitlist at ${SITE_URL}.`,
    "If this wasn't you, you can safely ignore this email.",
    '',
    `Vexara · ${SENDER_LOCATION}`,
    `Unsubscribe: ${unsubUrl}`,
  ].join('\n');
}

export async function sendAlphaWelcome(email: string): Promise<void> {
  await client().emails.send({
    from: FROM,
    to: [email],
    replyTo: REPLY_TO,
    subject: "You're on the Vexara alpha list",
    html: alphaWelcomeHtml(email),
    text: alphaWelcomeText(email),
    headers: {
      'List-Unsubscribe': `<${unsubscribeLinkFor(email)}>, <mailto:unsubscribe@vexara.world>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
