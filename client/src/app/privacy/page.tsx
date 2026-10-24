import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
	title: { absolute: 'Privacy Policy - Vexara' },
	description:
		'How Vexara collects, uses, and protects your data. No advertising trackers, no data sales. Optional, consent-based analytics only.',
	alternates: { canonical: '/privacy' },
	robots: { index: true, follow: true }
};

export default function PrivacyPage() {
	return (
		<>
			<PublicNav loc="Privacy" />
			<main
				style={{
					maxWidth: 720,
					margin: '0 auto',
					padding: '48px 24px',
					color: '#c8ccd6',
					fontFamily: 'inherit',
					lineHeight: 1.7
				}}
			>
			<h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>Privacy Policy</h1>
			<p style={{ color: '#8a90a0', marginBottom: 32 }}>Last updated: June 2026</p>

			<p>
				Vexara is a solo-developed browser game. This policy explains what data we collect and how
				we use it.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>What we collect</h2>
			<ul style={{ paddingLeft: 20 }}>
				<li>
					<strong>Account data:</strong> username, email address, hashed password.
				</li>
				<li>
					<strong>Gameplay data:</strong> nexus state, troop counts, attack logs, market activity -
					all necessary for the game to function.
				</li>
				<li>
					<strong>Technical data:</strong> IP address at registration (for spam prevention),
					browser/device type via User-Agent.
				</li>
				<li>
					<strong>Purchase data:</strong> if you buy Vex Points or a supporter tier via Ko-fi, we
					store the transaction reference, amount, date, and your Ko-fi profile name/email to credit
					your account and maintain billing records.
				</li>
				<li>
					<strong>Optional attribution:</strong> UTM parameters if you arrived via a referral link
					(source, medium, campaign).
				</li>
			</ul>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>What we don&apos;t collect</h2>
			<p>We do not use advertising trackers, and we never sell your data to anyone.</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Cookies and analytics</h2>
			<p>
				The game does not set cookies of its own to keep you signed in. Instead, your sign-in
				token, a cached copy of your basic account details, and your display and cookie-consent
				preferences are stored in your browser&apos;s <code>localStorage</code>, and any UTM tags
				from a campaign link are held in <code>sessionStorage</code> until you register. These
				are strictly necessary to run the game, stay signed in, and remember your choices, and
				they stay on your device until you sign out or clear your browser data.
			</p>
			<p>
				We also offer optional <strong>Google Analytics</strong> to understand how players find
				and use Vexara. If you accept it via the cookie banner, Google Analytics sets{' '}
				<code>_ga</code> and <code>_ga_*</code> cookies in your browser (typically retained for up
				to 13 months) and processes your IP address and usage data. This is entirely optional: the
				game works identically whether you accept or reject, and analytics cookies are never set
				until you opt in. You can change or withdraw your choice at any time using the{' '}
				<strong>Cookie settings</strong> link in the footer.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>How we use your data</h2>
			<ul style={{ paddingLeft: 20 }}>
				<li>To operate your account and run the game.</li>
				<li>
					To send transactional emails (email verification, password reset, welcome message). You
					can opt out of non-transactional emails via the unsubscribe link.
				</li>
				<li>To investigate abuse reports and maintain fair play.</li>
			</ul>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Third-party services</h2>
			<ul style={{ paddingLeft: 20 }}>
				<li>
					<strong>Resend</strong> - used to send emails. Your email address is transmitted to their
					service for delivery.
				</li>
				<li>
					<strong>Ko-fi</strong> - if you purchase Vex Points or a supporter tier, Ko-fi processes
					the payment. We receive a webhook containing your public Ko-fi profile name and email
					address so we can credit your account. We do not receive or store your payment card
					details. Purchase records (amount, date, Ko-fi transaction ID) are retained to fulfil
					your order and handle any billing disputes.
				</li>
				<li>
					<strong>Google Analytics</strong> - loaded only if you opt in via the cookie banner.
					Sets <code>_ga</code> cookies and sends usage data to Google. See the Cookies and
					analytics section above.
				</li>
			</ul>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Data retention and deletion</h2>
			<p>
				Your account and game data are retained as long as your account exists. To request deletion,
				email{' '}
				<a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>
					support@vexara.world
				</a>
				. We will delete your account and associated personal data within 30 days.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Your rights (GDPR)</h2>
			<p>
				If you are in the EU or UK, you have the right to access, correct, or delete your personal
				data. Contact{' '}
				<a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>
					support@vexara.world
				</a>{' '}
				to exercise these rights.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>Contact</h2>
			<p>
				Questions about this policy:{' '}
				<a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>
					support@vexara.world
				</a>
				.
			</p>
			</main>
			<SiteFooter />
		</>
	);
}
