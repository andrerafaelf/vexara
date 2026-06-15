import type { Metadata } from 'next';
import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';

export const metadata: Metadata = {
	title: 'Terms of Service - Vexara',
	description: 'Terms of service for Vexara, a browser-based 4X strategy game.',
	alternates: { canonical: '/terms' },
	robots: { index: true, follow: true }
};

export default function TermsPage() {
	return (
		<>
			<PublicNav loc="Terms" />
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
			<p style={{ color: '#8a90a0', marginBottom: 32 }}>Last updated: June 2026</p>

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

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>5. Purchases and virtual currency</h2>
			<p>
				Vexara offers real-money purchases through Ko-fi, including <strong>Vex Points (VP)</strong>,
				a virtual in-game currency, and supporter tiers. By completing a purchase you agree to the
				following:
			</p>
			<ul style={{ paddingLeft: 20, marginTop: 8 }}>
				<li>
					<strong>No refunds.</strong> All purchases, including Vex Points packs and supporter tiers,
					are final and non-refundable. Vex Points are a consumable virtual currency with no
					monetary value and cannot be exchanged for cash or transferred to another account.
				</li>
				<li>
					<strong>Virtual items only.</strong> Vex Points and any items or perks unlocked with them
					(season passes, titles, boosts, badges) are in-game virtual goods. They confer no
					real-world value and are not a purchase of any tangible product.
				</li>
				<li>
					<strong>No guarantee of availability.</strong> Virtual items and features purchased with VP
					are provided as part of the current game version. We may alter, remove, or replace
					in-game items, seasons, or features at any time without obligation to provide a refund or
					equivalent replacement.
				</li>
				<li>
					<strong>Account termination.</strong> If your account is suspended or terminated for a
					violation of these terms, any unused Vex Points and associated perks are forfeited without
					compensation.
				</li>
				<li>
					<strong>Payment processor.</strong> Payments are processed by Ko-fi. By making a purchase
					you also agree to Ko-fi&apos;s own terms and policies. Vexara does not store your payment
					card details.
				</li>
			</ul>
			<p style={{ marginTop: 12 }}>
				If you believe a charge was made in error (e.g. an unauthorised transaction), contact{' '}
				<a href="mailto:support@vexara.world" style={{ color: '#7aa2ff' }}>support@vexara.world</a>{' '}
				within 14 days and we will investigate. We cannot issue refunds for purchases that were
				intentionally made and successfully delivered.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>6. Termination</h2>
			<p>
				We reserve the right to suspend or delete accounts that violate these terms. You may delete
				your account at any time by contacting support@vexara.world.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>7. Intellectual property</h2>
			<p>
				Vexara, including its name, logo, visual design, user interface, game mechanics as expressed
				in code, artwork, and all written content, is the exclusive property of André Ferreira and
				is protected by copyright and applicable intellectual property law.
			</p>
			<p style={{ marginTop: 12 }}>
				You may not copy, reproduce, distribute, or create derivative works based on any part of
				Vexara (including its UI, art assets, or branding) without explicit written permission.
				This includes AI-generated reproductions of Vexara&apos;s visual identity or brand. Fan art
				is welcome, but must be clearly labelled as unofficial and may not be presented as or
				mistaken for official Vexara content.
			</p>

			<h2 style={{ color: '#fff', fontSize: 18, marginTop: 32 }}>8. Contact</h2>
			<p>
				Questions? Email{' '}
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
