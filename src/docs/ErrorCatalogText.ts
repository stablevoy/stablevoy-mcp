import { DocsUnavailableError } from './DocsUnavailableError.js';

/** The API's error catalog (GET /v1/errors) as Markdown: per group, each code with its HTTP status, meaning and what to do. */
export function errorCatalogText(catalog: unknown, url: string): string {
  const groups = (catalog as { groups?: unknown } | null)?.groups;
  if (!Array.isArray(groups)) throw new DocsUnavailableError(`${url} is not the error catalog.`);
  const out = ['# Stablevoy API error codes', '', 'Every error answer is a problem document with a stable code and a detail. What each code means and what to do:'];
  for (const group of groups as { title?: unknown; errors?: unknown }[]) {
    out.push('', `## ${String(group.title)}`, '');
    for (const e of (Array.isArray(group.errors) ? group.errors : []) as { code?: unknown; status?: unknown; meaning?: unknown; action?: unknown }[]) {
      out.push(`- \`${String(e.code)}\` (HTTP ${String(e.status)}): ${String(e.meaning)} What to do: ${String(e.action)}`);
    }
  }
  return `${out.join('\n')}\n`;
}
