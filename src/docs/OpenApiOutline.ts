import { DocsUnavailableError } from './DocsUnavailableError.js';

type Json = Record<string, unknown>;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * The API's OpenAPI document as Markdown an assistant can read: every operation with its summary, description, who may
 * call it, its parameters and the top-level fields of its JSON body. Schemas of the answers are left out (see the
 * error catalog and the docs pages for those).
 */
export function openApiOutline(document: unknown, url: string, apiUrl: string): string {
  const doc = object(document);
  const paths = object(doc?.['paths']);
  if (doc === null || paths === null) throw new DocsUnavailableError(`${url} is not an OpenAPI document.`);
  const schemas = object(object(doc['components'])?.['schemas']) ?? {};
  const out = [`# Stablevoy API operations`, '', `Base URL: ${apiUrl}. Store endpoints take the store API key as "Authorization: Bearer sk_live_...". The full description is ${url}.`];
  for (const [path, item] of Object.entries(paths)) {
    for (const method of METHODS) {
      const operation = object(object(item)?.[method]);
      if (operation === null) continue;
      out.push('', `## ${method.toUpperCase()} ${path}`, '');
      if (typeof operation['summary'] === 'string') out.push(operation['summary'], '');
      if (typeof operation['description'] === 'string') out.push(operation['description'], '');
      out.push(`Auth: ${authOf(operation)}`);
      const parameters = Array.isArray(operation['parameters']) ? operation['parameters'].map(object).filter((p): p is Json => p !== null) : [];
      for (const p of parameters) out.push(`- ${String(p['in'])} parameter \`${String(p['name'])}\`${p['required'] === true ? ' (required)' : ''}${describe(object(p['schema']) ?? p)}`);
      const body = resolve(object(object(object(object(operation['requestBody'])?.['content'])?.['application/json'])?.['schema']), schemas);
      const properties = object(body?.['properties']);
      const required = Array.isArray(body?.['required']) ? body['required'] : [];
      for (const [name, schema] of Object.entries(properties ?? {})) out.push(`- body field \`${name}\`${required.includes(name) ? ' (required)' : ''}${describe(object(schema))}`);
    }
  }
  return `${out.join('\n')}\n`;
}

function object(value: unknown): Json | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Json) : null;
}

function authOf(operation: Json): string {
  if (!Array.isArray(operation['security'])) return 'none';
  const names = operation['security'].map(object).flatMap((s) => (s === null ? [] : Object.keys(s)));
  return names.length === 0 ? 'none' : names.join(' or ');
}

function describe(schema: Json | null): string {
  const text = schema?.['description'];
  return typeof text === 'string' ? `: ${text}` : '';
}

function resolve(schema: Json | null, schemas: Json): Json | null {
  const ref = schema?.['$ref'];
  if (typeof ref !== 'string') return schema;
  return object(schemas[ref.replace('#/components/schemas/', '')]);
}
