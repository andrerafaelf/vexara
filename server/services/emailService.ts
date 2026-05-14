import FormData from 'form-data';
import Mailgun from 'mailgun.js';

const DOMAIN = 'vexara.world';
const FROM = 'Vexara <noreply@vexara.world>';

function client() {
  const mailgun = new Mailgun(FormData);
  return mailgun.client({
    username: 'api',
    key: process.env.MAILGUN_API_KEY ?? '',
    url: 'https://api.eu.mailgun.net',
  });
}

export async function sendAlphaWelcome(email: string): Promise<void> {
  await client().messages.create(DOMAIN, {
    from: FROM,
    to: [email],
    template: 'alpha-welcome',
  });
}
