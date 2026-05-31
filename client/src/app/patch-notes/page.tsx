import type { Metadata } from 'next';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import PublicNav from '@/components/PublicNav';
import PatchNotesBackToGame from '@/components/PatchNotesBackToGame';
import '@/styles/PatchNotes.css';

const TITLE = 'Patch Notes - Vexara Alpha Updates';
const DESCRIPTION =
  'Full changelog for Vexara - the free browser MMO RTS. Track every balance change, new feature, and bug fix across all alpha releases.';

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

// Patch notes are copied into public/patch-notes/ so Next.js standalone
// always includes them. process.cwd() resolves correctly in both dev and
// standalone production (public/ is always co-located with the server).
const PATCH_NOTES_DIR = join(process.cwd(), 'public', 'patch-notes');

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

// Escape HTML before we inject our own safe inline markup. Patch notes are
// authored in-repo (trusted), but escaping keeps stray `<`/`&` from breaking
// rendering and avoids surprises if a note ever quotes raw markup.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inline markdown → HTML: bold, inline code, and links. Run on already-escaped
// text so the produced tags are the only HTML in the output.
function applyInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    // [label](url) → anchor. Restrict to http(s)/relative URLs to avoid
    // javascript: and other unsafe schemes.
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$2" class="pn-entry-link" target="_blank" rel="noopener noreferrer">$1</a>');
}

const isTableSeparator = (line: string) => /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
const isTableRow = (line: string) => line.trimStart().startsWith('|') || (line.includes('|') && line.trim().length > 0);

function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

// Renders headings, bullet + numbered lists (with nesting), tables, bold,
// inline code, links, and paragraphs from a trusted markdown patch note.
function renderMarkdown(raw: string) {
  const lines = raw.split('\n');
  const elements: React.ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) {
      // Top-level version heading - skip, we render version from filename
      i++;
      continue;
    }

    if (line.startsWith('#### ')) {
      elements.push(
        <h4 key={i} className="pn-entry-subtitle">{line.slice(5).trim()}</h4>,
      );
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

    // Table block: a row of `| ... |` followed by a `|---|---|` separator.
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableCells(lines[i]);
      i += 2; // skip header + separator
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== '' && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
        bodyRows.push(splitTableCells(lines[i]));
        i++;
      }
      elements.push(
        <div key={i} className="pn-table-wrap">
          <table className="pn-table">
            <thead>
              <tr>
                {headerCells.map((c, idx) => (
                  <th key={idx} dangerouslySetInnerHTML={{ __html: applyInline(c) }} />
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyRows.map((row, rIdx) => (
                <tr key={rIdx}>
                  {row.map((c, cIdx) => (
                    <td key={cIdx} dangerouslySetInnerHTML={{ __html: applyInline(c) }} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Ordered (numbered) list block
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        let itemText = lines[i].replace(/^\s*\d+\.\s/, '');
        i++;
        while (i < lines.length && lines[i] !== '' && !/^\s*\d+\.\s/.test(lines[i]) && !lines[i].trimStart().startsWith('- ') && !lines[i].startsWith('#') && !lines[i].startsWith('---')) {
          itemText += ' ' + lines[i].trim();
          i++;
        }
        items.push(itemText);
      }
      elements.push(
        <ol key={i} className="pn-entry-list pn-entry-list-ordered">
          {items.map((item, idx) => (
            <li key={idx} dangerouslySetInnerHTML={{ __html: applyInline(item) }} />
          ))}
        </ol>,
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Bullet list block (supports one level of nesting via indentation)
    if (line.trimStart().startsWith('- ')) {
      type Item = { text: string; nested: string[] };
      const items: Item[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('- ')) {
        const indent = lines[i].length - lines[i].trimStart().length;
        if (indent >= 2 && items.length > 0) {
          // Indented bullet → nested child of the previous item.
          items[items.length - 1].nested.push(lines[i].trimStart().slice(2));
          i++;
          continue;
        }
        let itemText = lines[i].trimStart().slice(2);
        i++;
        // Wrapped continuation lines (not a new bullet / heading / rule).
        while (i < lines.length && lines[i] !== '' && !lines[i].trimStart().startsWith('- ') && !lines[i].startsWith('#') && !lines[i].startsWith('---')) {
          itemText += ' ' + lines[i].trim();
          i++;
        }
        items.push({ text: itemText, nested: [] });
      }
      elements.push(
        <ul key={i} className="pn-entry-list">
          {items.map((item, idx) => (
            <li key={idx}>
              <span dangerouslySetInnerHTML={{ __html: applyInline(item.text) }} />
              {item.nested.length > 0 && (
                <ul className="pn-entry-list pn-entry-list-nested">
                  {item.nested.map((n, nIdx) => (
                    <li key={nIdx} dangerouslySetInnerHTML={{ __html: applyInline(n) }} />
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>,
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Paragraph accumulation
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i] !== '' &&
      !lines[i].startsWith('##') &&
      !lines[i].startsWith('---') &&
      !lines[i].trimStart().startsWith('- ') &&
      !/^\s*\d+\.\s/.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      const html = applyInline(paraLines.join('\n'));
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
      <PublicNav />
      <PatchNotesBackToGame />

      <main className="pn-root">
        <header className="pn-header">
          <div className="pn-header-label">{'// TRANSMISSION LOG'}</div>
          <h1 className="pn-title">Patch Notes</h1>
          <p className="pn-subtitle">
            Every change, balance pass, and bug fix since alpha launch.
            Built by one developer - patches ship when they ship.
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
          <Link href="/register" className="pn-cta-btn">Enlist now - free, no download</Link>
        </div>
      </main>

      <SiteFooter />
    </>
  );
}
