import { Resend } from 'resend';

const FROM = 'Vexara <hello@vexara.world>';
const REPLY_TO = 'support@vexara.world';
const UNSUBSCRIBE_URL = 'https://vexara.world/api/unsubscribe';

let cached: Resend | null = null;
function client(): Resend {
  if (!cached) cached = new Resend(process.env.RESEND_API_KEY ?? '');
  return cached;
}

function alphaWelcomeHtml(): string {
  return `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#0b0d12;color:#e6e8ee;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#11141b;border-radius:12px;padding:32px;">
      <tr><td>
        <h1 style="margin:0 0 16px;font-size:22px;color:#fff;">You're on the Vexara alpha list</h1>
        <p style="margin:0 0 16px;line-height:1.55;">Thanks for signing up. You'll get an invite as soon as we open the next batch of alpha slots.</p>
        <p style="margin:0 0 16px;line-height:1.55;">In the meantime, follow along at <a href="https://vexara.world" style="color:#7aa2ff;">vexara.world</a>.</p>
        <p style="margin:24px 0 0;font-size:12px;color:#8a90a0;">You're receiving this because you joined the alpha waitlist at vexara.world. If this wasn't you, you can safely ignore this email.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

function alphaWelcomeText(): string {
  return [
    "You're on the Vexara alpha list",
    '',
    "Thanks for signing up. You'll get an invite as soon as we open the next batch of alpha slots.",
    '',
    'Follow along at https://vexara.world',
    '',
    "You're receiving this because you joined the alpha waitlist at vexara.world.",
    "If this wasn't you, you can safely ignore this email.",
  ].join('\n');
}

export async function sendAlphaWelcome(email: string): Promise<void> {
  await client().emails.send({
    from: FROM,
    to: [email],
    replyTo: REPLY_TO,
    subject: "You're on the Vexara alpha list",
    html: alphaWelcomeHtml(),
    text: alphaWelcomeText(),
    headers: {
      'List-Unsubscribe': `<${UNSUBSCRIBE_URL}?email=${encodeURIComponent(email)}>, <mailto:unsubscribe@vexara.world>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  });
}
