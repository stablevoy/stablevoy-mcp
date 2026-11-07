/** One page listed in llms.txt: its title, the address of its Markdown copy and a one-sentence summary. */
export interface DocEntry {
  readonly section: string;
  readonly title: string;
  readonly url: string;
  readonly description: string;
}

const LINE = /^- \[([^\]]+)\]\((https:\/\/[^)\s]+)\): (.+)$/;

/** The entries of an llms.txt file (llmstxt.org format): "- [Title](url): summary" lines under "## Section" headings. */
export function parseLlmsTxt(text: string): DocEntry[] {
  const entries: DocEntry[] = [];
  let section = '';
  for (const line of text.split('\n')) {
    if (line.startsWith('## ')) section = line.slice(3).trim();
    const match = LINE.exec(line.trim());
    if (match === null) continue;
    const [, title = '', url = '', description = ''] = match;
    entries.push({ section, title, url, description });
  }
  return entries;
}
