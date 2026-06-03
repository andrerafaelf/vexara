import Image from 'next/image';
import Link from 'next/link';
import '@/styles/SiteFooter.css';

export default function SiteFooter() {
	return (
		<footer className="site-footer" aria-label="Site footer">
			<div className="site-footer-inner">
				<div className="site-footer-mark">
					<Image
						src="/vexara-logo.png"
						alt="Vexara"
						width={44}
						height={44}
						className="site-footer-logo"
					/>
					<div className="site-footer-mark-text">
						<span className="site-footer-wordmark">Vexara</span>
						<span className="site-footer-tag">
							a persistent galaxy, hand-built by one developer
						</span>
					</div>
				</div>

				<nav className="site-footer-grid" aria-label="Footer navigation">
					<div className="site-footer-col">
						<span className="site-footer-col-title">{'// Play'}</span>
						<Link href="/register">Join live galaxy</Link>
						<Link href="/login">Sign in</Link>
						<Link href="/state-of-galaxy">Galaxy Status</Link>
						<Link href="/codex">Codex</Link>
						<Link href="/calculator">Calculator</Link>
						<Link href="/patch-notes">Patch Notes</Link>
					</div>
					<div className="site-footer-col">
						<span className="site-footer-col-title">{'// Outside'}</span>
						<a href="https://discord.gg/D858rzCHP7" target="_blank" rel="noopener noreferrer">
							Discord
						</a>
						<a href="mailto:support@vexara.world">support@vexara.world</a>
					</div>
					<div className="site-footer-col">
						<span className="site-footer-col-title">{'// Legal'}</span>
						<Link href="/terms">Terms</Link>
						<Link href="/privacy">Privacy</Link>
					</div>
				</nav>
			</div>

			<div className="site-footer-baseline">
				<span className="site-footer-baseline-line" aria-hidden="true" />
				<span className="site-footer-baseline-text">
					TRANSMISSION CLOSED &nbsp;//&nbsp; NO RESETS &nbsp;//&nbsp; NO PAY-TO-WIN &nbsp;//&nbsp;
					SOLO DEV {new Date().getFullYear()}
				</span>
				<span className="site-footer-baseline-line" aria-hidden="true" />
			</div>
		</footer>
	);
}
