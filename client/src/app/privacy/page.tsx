import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy — Vexara',
  description: 'How Vexara collects, uses, and protects your data. No advertising trackers, no third-party analytics, no data sales.',
  alternates: { canonical: '/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', color: '#c8ccd6', fontFamily: 'inherit', lineHeight: 1.7 }}>
      <h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: '#8a90a0', marginBottom: 32 }}>Last updated: May 2026</p>

      <p>Vexara is a solo-developed browser game. This policy explains what data we collect and how we use it.</p>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>What we collect</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Account data:</strong> username, email address, hashed password.</li>
        <li><strong>Gameplay data:</strong> nexus state, troop counts, attack logs, market activity — all necessary for the game to function.</li>
        <li><strong>Technical data:</strong> IP address at registration (for spam prevention), browser/device type via User-Agent.</li>
        <li><strong>Optional attribution:</strong> UTM parameters if you arrived via a referral link (source, medium, campaign).</li>
      </ul>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>What we don&apos;t collect</h2>
      <p>We do not use advertising trackers, third-party analytics, or sell your data to anyone.</p>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>How we use your data</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li>To operate your account and run the game.</li>
        <li>To send transactional emails (email verification, password reset, welcome message). You can opt out of non-transactional emails via the unsubscribe link.</li>
        <li>To investigate abuse reports and maintain fair play.</li>
      </ul>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Third-party services</h2>
      <ul style={{ paddingLeft: 20 }}>
        <li><strong>Resend</strong> — used to send emails. Your email address is transmitted to their service for delivery.</li>
        <li><strong>Ko-fi</strong> — if you make a voluntary donation, Ko-fi processes the payment. We receive a webhook with your public Ko-fi profile name and email.</li>
      </ul>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Data retention and deletion</h2>
      <p>Your account and game data are retained as long as your account exists. To request deletion, email <a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>support@vexara.world</a>. We will delete your account and associated personal data within 30 days.</p>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Your rights (GDPR)</h2>
      <p>If you are in the EU or UK, you have the right to access, correct, or delete your personal data. Contact <a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>support@vexara.world</a> to exercise these rights.</p>

      <h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Contact</h2>
      <p>Questions about this policy: <a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>support@vexara.world</a>.</p>
    </main>
  );
}
