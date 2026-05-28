import type { Metadata } from 'next';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import SiteFooter from '@/components/SiteFooter';
import Link from 'next/link';
import '@/styles/PatchNotes.css';

const TITLE = 'Patch Notes - Vexara Alpha Updates';
const DESCRIPTION =
  'Full changelog for Vexara — the free browser MMO RTS. Track every balance change, new feature, and bug fix across all alpha releases.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['Vexara patch notes', 'Vexara updates', 'Vexara changelog', 'Vexara alpha'],
  alternates: { canonical: '/patch-notes' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://vexara.world/patch-notes',
    siteName: 'Vexara',
    locale: 'en_US',
    type: 'article',
  },
  robots: { index: true, follow: true },
};

// process.cwd() is the client/ directory when Next.js runs.
// Patch notes live one level up at the repo root (vexara/).
const PATCH_NOTES_DIR = join(process.cwd(), '..');

interface PatchNote {
  label: string;   // e.g. "ALPHA v0.9" or "BETA v1.0" or "v1.0"
  sortKey: string; // raw version string for sorting, e.g. "0.9"
  raw: string;
}

// Matches PATCH_NOTES_<ANYTHING>_<VERSION>.md  or  PATCH_NOTES_<VERSION>.md
const PATCH_FILE_RE = /^PATCH_NOTES_(?:([A-Z0-9]+)_)?(\d+\.\d+(?:\.\d+)?)\.md$/i;

function loadPatchNotes(): PatchNote[] {
  let files: string[];
  try {
    files = readdirSync(PATCH_NOTES_DIR).filter((f) => PATCH_FILE_RE.test(f));
  } catch {
    return [];
  }

  return files
    .map((file) => {
      const m = file.match(PATCH_FILE_RE);
      if (!m) return null;
      const [, stage, version] = m; // stage = "ALPHA" | "BETA" | undefined
      const label = stage ? `${stage} v${version}` : `v${version}`;
      const raw = readFileSync(join(PATCH_NOTES_DIR, file), 'utf-8');
      return { label, sortKey: version, raw };
    })
    .filter((p): p is PatchNote => p !== null)
    .sort((a, b) => {
      const parseVer = (v: string) => v.split('.').map(Number);
      const av = parseVer(a.sortKey);
      const bv = parseVer(b.sortKey);
      for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        const diff = (bv[i] ?? 0) - (av[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
}

// Minimal markdown renderer: bold, horizontal rules, headings, paragraphs
function renderMarkdown(raw: string) {
  const lines = raw.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      // Top-level version heading — skip, we render version from filename
      i++;
      continue;
    }

    if (line.startsWith('### ')) {
      elements.push(
        <h3 key={i} className="pn-entry-title">
          {line.slice(4).trim()}
        </h3>,
      );
      i++;
      continue;
    }

    if (line.startsWith('---')) {
      i++;
      continue;
    }

    // Paragraph / list accumulation
    const paraLines: string[] = [];
    while (i < lines.length && lines[i] !== '' && !lines[i].startsWith('##') && !lines[i].startsWith('---')) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const html = paraLines
        .join('\n')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      elements.push(
        <p key={i} className="pn-entry-para" dangerouslySetInnerHTML={{ __html: html }} />,
      );
    }

    // Skip blank lines
    while (i < lines.length && lines[i] === '') i++;
  }

  return elements;
}

function parseSummary(raw: string): string {
  // Second non-empty line after the ## heading is the subtitle/summary
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  return lines.length > 1 ? lines[1].replace(/^#+\s*/, '') : '';
}

export default function PatchNotesPage() {
  const patches = loadPatchNotes();

  return (
    <>
      <nav className="pn-nav" aria-label="Site navigation">
        <Link href="/" className="pn-nav-mark">
          <span className="pn-nav-stamp">VX</span>
          <span className="pn-nav-wordmark">Vexara</span>
        </Link>
        <div className="pn-nav-links">
          <Link href="/codex">Codex</Link>
          <Link href="/register" className="pn-nav-cta">Enlist</Link>
        </div>
      </nav>

      <main className="pn-root">
        <header className="pn-header">
          <div className="pn-header-label">// TRANSMISSION LOG</div>
          <h1 className="pn-title">Patch Notes</h1>
          <p className="pn-subtitle">
            Every change, balance pass, and bug fix since alpha launch.
            Built by one developer — patches ship when they ship.
          </p>
        </header>

        {patches.length === 0 ? (
          <p className="pn-empty">No patch notes found.</p>
        ) : (
          <div className="pn-feed">
            {patches.map((patch) => (
              <article key={patch.label} className="pn-patch" id={`v${patch.sortKey}`}>
                <div className="pn-patch-header">
                  <div className="pn-patch-version">
                    <span className="pn-patch-num">{patch.label}</span>
                  </div>
                  <p className="pn-patch-summary">{parseSummary(patch.raw)}</p>
                </div>
                <div className="pn-entries">{renderMarkdown(patch.raw)}</div>
              </article>
            ))}
          </div>
        )}

        <div className="pn-cta-block">
          <p className="pn-cta-text">Playing since before any of these patches? You helped shape all of this.</p>
          <Link href="/register" className="pn-cta-btn">Enlist now — free, no download</Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
