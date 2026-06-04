'use client';

import { OPEN_EVENT } from '@/components/CookieConsent';

// Re-opens the cookie consent banner so users can change or withdraw their
// choice at any time (GDPR: withdrawing consent must be as easy as giving it).
export default function CookieSettingsLink() {
	return (
		<button
			type="button"
			className="site-footer-link-button"
			onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
		>
			Cookie settings
		</button>
	);
}
