import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { loadPatchNotes } from '@/lib/patchNotes';
import '@/styles/PatchNotes.css';
import type { Metadata } from 'next';
import Link from 'next/link';

const TITLE = 'Patch Notes - Vexara Alpha Updates';
const DESCRIPTION =
	'Full changelog for Vexara - the free browser MMO RTS. Track every balance change, new feature, and bug fix across all alpha releases.';

export const metadata: Metadata = {
	title: { absolute: TITLE },
	description: DESCRIPTION,
	keywords: ['Vexara patch notes', 'Vexara updates', 'Vexara changelog', 'Vexara alpha'],
	alternates: { canonical: '/patch-notes' },
	openGraph: {
		title: TITLE,
		description: DESCRIPTION,
		url: 'https://vexara.world/patch-notes',
		siteName: 'Vexara',
		locale: 'en_US',
		type: 'article'
	},
	robots: { index: true, follow: true }
};

export default function PatchNotesPage() {
	const patches = loadPatchNotes();

	return (
		<>
			<PublicNav loc="Patch Notes" />

			<main className="pn-root pn-root--index">
				<header className="pn-header">
					<div className="pn-header-label">{'// TRANSMISSION LOG'}</div>
					<h1 className="pn-title">Patch Notes</h1>
					<p className="pn-subtitle">
						Every change, balance pass, and bug fix since alpha launch. Built by one developer,
						patches ship when they ship.
					</p>
				</header>

				{patches.length === 0 ? (
					<p className="pn-empty">No patch notes found.</p>
				) : (
					<div className="pn-card-grid">
						{patches.map((patch, idx) => (
							<Link
								key={patch.slug}
								href={`/patch-notes/${patch.slug}`}
								className={`pn-card ${idx === 0 ? 'pn-card--latest' : ''}`}
							>
								{idx === 0 && <span className="pn-card-badge">Latest</span>}
								<span className="pn-card-version">{patch.label}</span>
								<p className="pn-card-summary">{patch.summary}</p>
								<span className="pn-card-read">Read patch notes →</span>
							</Link>
						))}
					</div>
				)}

				<div className="pn-cta-block">
					<p className="pn-cta-text">
						Playing since before any of these patches? You helped shape all of this.
					</p>
					<Link href="/register" className="pn-cta-btn">
						Join the live galaxy
					</Link>
				</div>
			</main>

			<SiteFooter />
		</>
	);
}
