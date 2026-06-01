import type { Metadata } from 'next';

export const metadata: Metadata = {
	title: 'Terms of Service - Vexara',
	description: 'Terms of service for Vexara, a browser-based 4X strategy game.',
	alternates: { canonical: '/terms' },
	robots: { index: true, follow: true }
};

export default function TermsPage() {
	return (
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
			<h1 style={{ color: '#fff', fontSize: 28, marginBottom: 8 }}>Terms of Service</h1>
			<p style={{ color: '#8a90a0', marginBottom: 32 }}>Last updated: May 2026</p>

			<p>
				Vexara is a browser-based strategy game operated as a solo project. By creating an account
				and using the service you agree to the following terms.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>1. Your account</h2>
			<p>
				You are responsible for keeping your credentials secure. You may not create multiple
				accounts to gain an unfair advantage, impersonate other players, or share accounts.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>2. Acceptable use</h2>
			<p>
				You agree not to: abuse, harass, or threaten other players; exploit bugs for unfair
				advantage (please report them instead); attempt to reverse-engineer or interfere with the
				service; use automation or bots.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>3. Content</h2>
			<p>
				Usernames and in-game messages must not contain hate speech, slurs, or illegal content. We
				reserve the right to rename or suspend accounts that violate this.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>4. Service availability</h2>
			<p>
				Vexara is provided as-is. We may modify, suspend, or discontinue the service at any time. We
				are not liable for lost in-game progress due to downtime or technical issues.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>5. Purchases</h2>
			<p>
				Ko-fi donations are voluntary and non-refundable. In-game supporter perks are granted as a
				thank-you and do not constitute a purchase of game advantage.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>6. Termination</h2>
			<p>
				We reserve the right to suspend or delete accounts that violate these terms. You may delete
				your account at any time by contacting support@vexara.world.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>7. Contact</h2>
			<p>
				Questions? Email{' '}
				<a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>
					support@vexara.world
				</a>
				.
			</p>
		</main>
	);
}
