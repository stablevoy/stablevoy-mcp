import type { MarkdownSection } from './MarkdownSections.js';

export interface SearchablePage {
  readonly title: string;
  readonly path: string;
  readonly url: string;
  readonly sections: readonly MarkdownSection[];
}

export interface SectionHit {
  readonly page: string;
  readonly path: string;
  readonly url: string;
  readonly heading: string;
  readonly text: string;
}

export const MAX_HITS = 5;
export const MAX_SECTION_CHARS = 2000;

const STOP_WORDS = new Set(['the', 'and', 'how', 'to', 'of', 'in', 'for', 'is', 'do', 'does', 'what', 'with', 'on', 'my', 'can', 'an', 'it', 'are', 'by', 'or', 'be', 'from', 'when', 'which', 'stablevoy']);

/** The words of a query that can match: lower case, two characters or more, common words left out. */
export function termsOf(query: string): string[] {
  const words = query.toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/**
 * The best sections for the query: each distinct word found counts most, then how often the words appear, more in a
 * heading or the page title. Sections that match no word are left out, so no match is an empty list.
 */
export function searchSections(pages: readonly SearchablePage[], query: string): SectionHit[] {
  const terms = termsOf(query);
  const scored: { hit: SectionHit; score: number }[] = [];
  for (const page of pages) {
    const title = page.title.toLowerCase();
    for (const section of page.sections) {
      const heading = section.heading.toLowerCase();
      const text = section.text.toLowerCase();
      let distinct = 0;
      let score = 0;
      for (const term of terms) {
        const inText = Math.min(occurrences(text, term), 5);
        const inHeading = heading.includes(term);
        if (inText === 0 && !inHeading) continue;
        distinct += 1;
        score += inText + (inHeading ? 3 : 0) + (title.includes(term) ? 2 : 0);
      }
      if (distinct > 0) scored.push({ hit: { page: page.title, path: page.path, url: page.url, heading: section.heading, text: clip(section.text) }, score: distinct * 10 + score });
    }
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, MAX_HITS).map((s) => s.hit);
}

function occurrences(text: string, term: string): number {
  let count = 0;
  for (let at = text.indexOf(term); at !== -1; at = text.indexOf(term, at + term.length)) count += 1;
  return count;
}

function clip(text: string): string {
  if (text.length <= MAX_SECTION_CHARS) return text;
  const cut = text.lastIndexOf('\n\n', MAX_SECTION_CHARS);
  return `${text.slice(0, cut > MAX_SECTION_CHARS / 2 ? cut : MAX_SECTION_CHARS).trimEnd()}\n\n(cut here: get_doc has the whole page)`;
}
