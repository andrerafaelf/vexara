import { loadPatchNote } from '@/lib/patchNotes';
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '@/lib/ogCard';

// Per-version social card. Discord/X/Slack pull this when a /patch-notes/<v>
// link is shared, instead of the generic site screenshot. Node runtime (loadPatchNote
// reads markdown off disk via fs).
export const contentType = OG_CONTENT_TYPE;
export const size = OG_SIZE;
export const alt = 'Vexara Patch Notes';

interface Props {
	params: Promise<{ version: string }>;
}

// The shared parseSummary() returns only the first PHYSICAL line under the H1,
// which in our notes is a hard-wrapped paragraph — so it can end mid-sentence
// ("…combat is"). For the social card we want a complete-reading clause, so pull
// the whole first paragraph (joining wrapped lines) and clamp it ourselves.
function summaryParagraph(raw: string): string {
	const lines = raw.split('\n');
	const out: string[] = [];
	let seenH1 = false;
	for (const line of lines) {
		const t = line.trim();
		if (!seenH1) {
			if (t.startsWith('#')) seenH1 = true;
			continue;
		}
		if (t === '') {
			if (out.length > 0) break; // end of the first paragraph
			continue; // skip blank lines between H1 and paragraph
		}
		if (t.startsWith('#') || t.startsWith('---')) break;
		out.push(t);
	}
	return out.join(' ').replace(/\s+/g, ' ').trim();
}

// Trim to a readable length on a word boundary, adding an ellipsis. ~115 chars
// fits in two lines under the big version label without hitting the footer.
function clampSummary(text: string, max = 115): string {
	const t = text.trim();
	if (t.length <= max) return t;
	const cut = t.slice(0, max);
	const lastSpace = cut.lastIndexOf(' ');
	return `${(lastSpace > 50 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export default async function Image({ params }: Props) {
	const { version } = await params;
	const patch = loadPatchNote(version);
	const label = patch?.label ?? `v${version}`;
	const summary = patch
		? clampSummary(summaryParagraph(patch.raw) || patch.summary)
		: 'Patch notes for the persistent galaxy.';

	return await renderOgCard({
		eyebrow: 'Transmission Log',
		kicker: 'Patch Notes',
		title: label,
		titleSize: 128,
		subtitle: summary,
		footer: 'vexara.world // patch-notes'
	});
}
