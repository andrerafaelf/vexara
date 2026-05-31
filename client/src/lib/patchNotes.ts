import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ReactNode } from 'react';
import React from 'react';

const PATCH_NOTES_DIR = join(process.cwd(), 'public', 'patch-notes');
const PATCH_FILE_RE = /^PATCH_NOTES_(?:([A-Z0-9]+)_)?(\d+\.\d+(?:\.\d+)?)\.md$/i;

export interface PatchNote {
  label: string;   // e.g. "ALPHA v0.16.2"
  sortKey: string; // raw version string, e.g. "0.16.2"
  slug: string;    // URL-safe, e.g. "0.16.2"
  raw: string;
  summary: string;
}

export function loadPatchNotes(): PatchNote[] {
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
      const [, stage, version] = m;
      const label = stage ? `${stage} v${version}` : `v${version}`;
      const raw = readFileSync(join(PATCH_NOTES_DIR, file), 'utf-8');
      return { label, sortKey: version, slug: version, raw, summary: parseSummary(raw) };
    })
    .filter((p): p is PatchNote => p !== null)
    .sort((a, b) => {
      const av = a.sortKey.split('.').map(Number);
      const bv = b.sortKey.split('.').map(Number);
      for (let i = 0; i < Math.max(av.length, bv.length); i++) {
        const diff = (bv[i] ?? 0) - (av[i] ?? 0);
        if (diff !== 0) return diff;
      }
      return 0;
    });
}

export function loadPatchNote(slug: string): PatchNote | null {
  const all = loadPatchNotes();
  return all.find((p) => p.slug === slug) ?? null;
}

export function parseSummary(raw: string): string {
  const lines = raw.split('\n').filter((l) => l.trim() !== '');
  return lines.length > 1 ? lines[1].replace(/^#+\s*/, '') : '';
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function applyInline(text: string): string {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+|\/[^)\s]*)\)/g,
      '<a href="$2" class="pn-entry-link" target="_blank" rel="noopener noreferrer">$1</a>');
}

const isTableSeparator = (line: string) =>
  /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(line) && line.includes('-');
const isTableRow = (line: string) =>
  line.trimStart().startsWith('|') || (line.includes('|') && line.trim().length > 0);

function splitTableCells(line: string): string[] {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|')) s = s.slice(0, -1);
  return s.split('|').map((c) => c.trim());
}

export function renderMarkdown(raw: string): ReactNode[] {
  const lines = raw.split('\n');
  const elements: ReactNode[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith('## ')) { i++; continue; }

    if (line.startsWith('#### ')) {
      elements.push(React.createElement('h4', { key: i, className: 'pn-entry-subtitle' }, line.slice(5).trim()));
      i++; continue;
    }

    if (line.startsWith('### ')) {
      elements.push(React.createElement('h3', { key: i, className: 'pn-entry-title' }, line.slice(4).trim()));
      i++; continue;
    }

    if (line.startsWith('---')) { i++; continue; }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headerCells = splitTableCells(lines[i]);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length && lines[i].trim() !== '' && isTableRow(lines[i]) && !isTableSeparator(lines[i])) {
        bodyRows.push(splitTableCells(lines[i]));
        i++;
      }
      elements.push(
        React.createElement('div', { key: i, className: 'pn-table-wrap' },
          React.createElement('table', { className: 'pn-table' },
            React.createElement('thead', null,
              React.createElement('tr', null,
                ...headerCells.map((c, idx) =>
                  React.createElement('th', { key: idx, dangerouslySetInnerHTML: { __html: applyInline(c) } })
                )
              )
            ),
            React.createElement('tbody', null,
              ...bodyRows.map((row, rIdx) =>
                React.createElement('tr', { key: rIdx },
                  ...row.map((c, cIdx) =>
                    React.createElement('td', { key: cIdx, dangerouslySetInnerHTML: { __html: applyInline(c) } })
                  )
                )
              )
            )
          )
        )
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Ordered list
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
        React.createElement('ol', { key: i, className: 'pn-entry-list pn-entry-list-ordered' },
          ...items.map((item, idx) =>
            React.createElement('li', { key: idx, dangerouslySetInnerHTML: { __html: applyInline(item) } })
          )
        )
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Bullet list
    if (line.trimStart().startsWith('- ')) {
      type Item = { text: string; nested: string[] };
      const items: Item[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('- ')) {
        const indent = lines[i].length - lines[i].trimStart().length;
        if (indent >= 2 && items.length > 0) {
          items[items.length - 1].nested.push(lines[i].trimStart().slice(2));
          i++;
          continue;
        }
        let itemText = lines[i].trimStart().slice(2);
        i++;
        while (i < lines.length && lines[i] !== '' && !lines[i].trimStart().startsWith('- ') && !lines[i].startsWith('#') && !lines[i].startsWith('---')) {
          itemText += ' ' + lines[i].trim();
          i++;
        }
        items.push({ text: itemText, nested: [] });
      }
      elements.push(
        React.createElement('ul', { key: i, className: 'pn-entry-list' },
          ...items.map((item, idx) =>
            React.createElement('li', { key: idx },
              React.createElement('span', { dangerouslySetInnerHTML: { __html: applyInline(item.text) } }),
              item.nested.length > 0
                ? React.createElement('ul', { className: 'pn-entry-list pn-entry-list-nested' },
                    ...item.nested.map((n, nIdx) =>
                      React.createElement('li', { key: nIdx, dangerouslySetInnerHTML: { __html: applyInline(n) } })
                    )
                  )
                : null
            )
          )
        )
      );
      while (i < lines.length && lines[i] === '') i++;
      continue;
    }

    // Paragraph
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
      elements.push(
        React.createElement('p', { key: i, className: 'pn-entry-para', dangerouslySetInnerHTML: { __html: applyInline(paraLines.join('\n')) } })
      );
    }

    while (i < lines.length && lines[i] === '') i++;
  }

  return elements;
}
