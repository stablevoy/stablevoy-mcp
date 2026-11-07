/** A part of a page from one heading to the next. The text before the first subheading belongs to the page title. */
export interface MarkdownSection {
  readonly heading: string;
  readonly text: string;
}

const HEADING = /^#{1,4} \S/;

/** The sections of a Markdown page; headings inside code blocks are text, not headings. */
export function sectionsOf(markdown: string): MarkdownSection[] {
  const sections: { heading: string; lines: string[] }[] = [];
  let current: { heading: string; lines: string[] } | null = null;
  let inCode = false;
  for (const line of markdown.split('\n')) {
    if (line.startsWith('```')) inCode = !inCode;
    if (!inCode && HEADING.test(line)) {
      current = { heading: line.slice(line.indexOf(' ') + 1).trim(), lines: [] };
      sections.push(current);
    } else {
      current?.lines.push(line);
    }
  }
  return sections.map((s) => ({ heading: s.heading, text: s.lines.join('\n').trim() })).filter((s) => s.text !== '');
}
