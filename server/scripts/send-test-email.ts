/**
 * Usage:
 *   npx tsx scripts/send-test-email.ts [template] [to]
 *
 * Templates: verify | welcome | reset | alpha-welcome | alpha-invite
 *
 * Examples:
 *   npx tsx scripts/send-test-email.ts welcome
 *   npx tsx scripts/send-test-email.ts alpha-invite someone@example.com
 *
 * Reads RESEND_API_KEY from the environment (or a .env file if dotenv is available).
 */

import 'dotenv/config';
import {
  sendAlphaInviteAnnouncement,
  sendAlphaWelcome,
  sendPasswordReset,
  sendVerifyEmail,
  sendWelcome,
} from '../services/emailService.js';

const TEMPLATE = process.argv[2] ?? 'welcome';
const TO = process.argv[3] ?? 'andrerafaelff@gmail.com';

const FAKE_TOKEN = 'test-token-0000000000000000000000000000000000000000000000000000000000';
const FAKE_REFERRAL = 'TEST1234';

const TEMPLATES: Record<string, () => Promise<void>> = {
  verify:       () => sendVerifyEmail(TO, 'TestCommander', FAKE_TOKEN),
  welcome:      () => sendWelcome(TO, 'TestCommander', FAKE_REFERRAL),
  reset:        () => sendPasswordReset(TO, 'TestCommander', FAKE_TOKEN),
  'alpha-welcome': () => sendAlphaWelcome(TO),
  'alpha-invite':  () => sendAlphaInviteAnnouncement(TO),
};

const run = TEMPLATES[TEMPLATE];
if (!run) {
  console.error(`Unknown template "${TEMPLATE}". Choose: ${Object.keys(TEMPLATES).join(' | ')}`);
  process.exit(1);
}

if (!process.env.RESEND_API_KEY) {
  console.error('RESEND_API_KEY is not set. Export it or add a .env file.');
  process.exit(1);
}

console.log(`Sending "${TEMPLATE}" to ${TO} …`);
run()
  .then(() => console.log('Done.'))
  .catch((err) => { console.error('Failed:', err); process.exit(1); });
