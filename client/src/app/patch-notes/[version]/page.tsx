import PublicNav from '@/components/PublicNav';
import SiteFooter from '@/components/SiteFooter';
import { loadPatchNote, loadPatchNotes, renderMarkdown } from '@/lib/patchNotes';
import '@/styles/PatchNotes.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

interface Props {
	params: Promise<{ version: string }>;
}

export async function generateStaticParams() {
	const patches = loadPatchNotes();
	return patches.map((p) => ({ version: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
	const { version } = await params;
	const patch = loadPatchNote(version);
	if (!patch) return {};

	const title = `${patch.label} Patch Notes - Vexara`;
	const description = patch.summary;

	return {
		title,
		description,
		alternates: { canonical: `/patch-notes/${version}` },
		openGraph: {
			title,
			description,
			url: `https://vexara.world/patch-notes/${version}`,
			siteName: 'Vexara',
			locale: 'en_US',
			type: 'article'
		},
		robots: { index: true, follow: true }
	};
}

export default async function PatchNotePage({ params }: Props) {
	const { version } = await params;
	const patch = loadPatchNote(version);
	if (!patch) notFound();

	const all = loadPatchNotes();
	const idx = all.findIndex((p) => p.slug === version);
	const newer = idx > 0 ? all[idx - 1] : null;
	const older = idx < all.length - 1 ? all[idx + 1] : null;

	return (
		<>
			<PublicNav loc="Patch Notes" />

			<main className="pn-root pn-root--detail">
				<div className="pn-detail-back">
					<Link href="/patch-notes" className="pn-detail-back-link">
						← All patch notes
					</Link>
				</div>

				<article>
					<header className="pn-detail-header">
						<span className="pn-header-label">{'// TRANSMISSION LOG'}</span>
						<h1 className="pn-detail-version">{patch.label}</h1>
						<p className="pn-detail-summary">{patch.summary}</p>
					</header>

					<div className="pn-entries pn-entries--detail">{renderMarkdown(patch.raw)}</div>
				</article>

				<nav className="pn-detail-nav" aria-label="Patch navigation">
					{older ? (
						<Link
							href={`/patch-notes/${older.slug}`}
							className="pn-detail-nav-link pn-detail-nav-link--prev"
						>
							<span className="pn-detail-nav-dir">← Older</span>
							<span className="pn-detail-nav-label">{older.label}</span>
						</Link>
					) : (
						<span />
					)}
					{newer ? (
						<Link
							href={`/patch-notes/${newer.slug}`}
							className="pn-detail-nav-link pn-detail-nav-link--next"
						>
							<span className="pn-detail-nav-dir">Newer →</span>
							<span className="pn-detail-nav-label">{newer.label}</span>
						</Link>
					) : (
						<span />
					)}
				</nav>

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
