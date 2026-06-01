// Generates a TOTP secret for admin 2FA enrollment.
// Run once per admin user: `tsx scripts/generate-totp.ts [label]`
// - Put the printed `ADMIN_TOTP_SECRET=...` line in admin-server/.env
// - Scan the printed otpauth:// URL with Google Authenticator / 1Password / Authy
//   (paste it into a QR generator if your app doesn't accept URLs directly).
// - Generate a session secret too: `openssl rand -hex 32` → ADMIN_SESSION_SECRET
import speakeasy from 'speakeasy';

const label = process.argv[2] || 'admin@vexara';
const issuer = 'Vexara Admin';

const secret = speakeasy.generateSecret({
	name: `${issuer}:${label}`,
	issuer,
	length: 32
});

console.log('');
console.log('--- Add to admin-server/.env ---');
console.log(`ADMIN_TOTP_SECRET=${secret.base32}`);
console.log('');
console.log('--- Enroll authenticator app with this URL ---');
console.log(secret.otpauth_url);
console.log('');
console.log('If your app needs a QR code, paste the otpauth URL into a QR generator');
console.log('(e.g. https://www.qrcode-monkey.com/) and scan that.');
console.log('');
