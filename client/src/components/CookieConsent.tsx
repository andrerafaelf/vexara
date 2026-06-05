'use client';

import '@/styles/CookieConsent.css';
import Script from 'next/script';
import { useCallback, useEffect, useState } from 'react';

// GDPR / ePrivacy consent gate for Google Analytics.
//
// GA writes _ga / _ga_* cookies the instant gtag('config') runs. Those cookies
// are NOT "strictly necessary", so under the ePrivacy Directive + GDPR they
// require prior, explicit opt-in. This component is the single place GA is
// allowed to load: the gtag scripts are mounted ONLY after the visitor has
// actively accepted. Until then — and forever, if they reject — no GA script
// runs and no _ga cookie is ever set.
//
// The choice is persisted in localStorage. A "Manage cookies" control elsewhere
// (footer) dispatches the `open-cookie-settings` event to re-open this banner so
// users can withdraw consent as easily as they gave it. Withdrawing also expires
// any _ga cookies already on the domain.

export const GA_MEASUREMENT_ID = 'G-561C095VR9';
const STORAGE_KEY = 'cookieConsent.v1';
export const OPEN_EVENT = 'open-cookie-settings';

type Consent = 'accepted' | 'rejected';

function readConsent(): Consent | null {
	try {
		const v = localStorage.getItem(STORAGE_KEY);
		return v === 'accepted' || v === 'rejected' ? v : null;
	} catch {
		return null;
	}
}

// Best-effort removal of any _ga / _gid cookies already planted, so that
// rejecting (or withdrawing) actually clears tracking state rather than just
// stopping future writes. GA sets these at the registrable-domain level, so we
// expire across the current host and its parent domain.
function clearGaCookies() {
	if (typeof document === 'undefined') return;
	const names = document.cookie
		.split(';')
		.map((c) => c.split('=')[0].trim())
		.filter((n) => n === '_ga' || n.startsWith('_ga_') || n === '_gid' || n === '_gat');
	const host = window.location.hostname;
	const parent = host.startsWith('www.') ? host.slice(4) : host;
	const domains = ['', host, `.${host}`, parent, `.${parent}`];
	for (const name of names) {
		for (const domain of domains) {
			const d = domain ? `; domain=${domain}` : '';
			document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${d}`;
		}
	}
}

export default function CookieConsent() {
	// null = undecided (show banner), otherwise the stored choice.
	const [consent, setConsent] = useState<Consent | null>(null);
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const stored = readConsent();
		setConsent(stored);
		if (stored === null) setOpen(true);

		const reopen = () => setOpen(true);
		window.addEventListener(OPEN_EVENT, reopen);
		return () => window.removeEventListener(OPEN_EVENT, reopen);
	}, []);

	const choose = useCallback((choice: Consent) => {
		try {
			localStorage.setItem(STORAGE_KEY, choice);
		} catch {
			/* private mode / quota — choice just won't persist */
		}
		if (choice === 'rejected') clearGaCookies();
		setConsent(choice);
		setOpen(false);
	}, []);

	const loadGa = consent === 'accepted';

	return (
		<>
			{loadGa && (
				<>
					<Script
						src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
						strategy="afterInteractive"
					/>
					<Script id="ga-init" strategy="afterInteractive">
						{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${GA_MEASUREMENT_ID}');`}
					</Script>
				</>
			)}

			{open && (
				<div
					className="cookie-consent"
					role="dialog"
					aria-modal="false"
					aria-label="Cookie consent"
				>
					<div className="cookie-consent-body">
						<p className="cookie-consent-title">Cookies &amp; analytics</p>
						<p className="cookie-consent-text">
							Vexara uses Google Analytics to understand how players find and use the game. This
							sets <code>_ga</code> cookies in your browser. It&apos;s entirely optional, the game
							works the same either way. See our <a href="/privacy">Privacy Policy</a> for details.
						</p>
					</div>
					<div className="cookie-consent-actions">
						<button
							type="button"
							className="cookie-consent-btn cookie-consent-reject"
							onClick={() => choose('rejected')}
						>
							Reject
						</button>
						<button
							type="button"
							className="cookie-consent-btn cookie-consent-accept"
							onClick={() => choose('accepted')}
						>
							Accept
						</button>
					</div>
				</div>
			)}
		</>
	);
}
