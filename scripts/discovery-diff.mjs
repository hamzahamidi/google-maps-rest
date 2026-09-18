#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

function load(dir, file) {
  const path = join(dir, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

export function walkMethods(document) {
  const out = new Map();
  const collect = (methods) => {
    for (const method of Object.values(methods ?? {})) out.set(method.id, method);
  };
  const walk = (resources) => {
    for (const resource of Object.values(resources ?? {})) {
      collect(resource.methods);
      walk(resource.resources);
    }
  };
  collect(document.methods);
  walk(document.resources);
  return out;
}

const SIGNATURE_KEYS = ['type', 'format', 'enum', 'enumDeprecated', 'repeated', 'required', 'minimum', 'maximum', 'pattern', 'deprecated'];

export function signature(node) {
  const out = {};
  for (const key of SIGNATURE_KEYS) if (node[key] !== undefined) out[key] = node[key];
  if (node.additionalProperties !== undefined) out.map = true;
  return JSON.stringify(out);
}

/** Flattens a schema into dotted field paths, so a renamed, retyped or nested change reads as one line. */
export function fields(document, ref, prefix = '', seen = new Set()) {
  const out = new Map();
  const visit = (node, path, stack) => {
    if (!node) return;
    if (node.$ref) {
      if (stack.has(node.$ref)) return;
      const next = new Set(stack).add(node.$ref);
      visit(document.schemas?.[node.$ref], path, next);
      return;
    }
    for (const [name, prop] of Object.entries(node.properties ?? {})) {
      const child = path ? `${path}.${name}` : name;
      out.set(child, signature(prop.items ?? prop));
      visit(prop.items ?? prop, prop.items ? `${child}[]` : child, stack);
    }
    if (typeof node.additionalProperties === 'object') visit(node.additionalProperties, `${path}{}`, stack);
  };
  visit({ $ref: ref }, prefix, seen);
  return out;
}

function diffMaps(before, after, label, lines) {
  for (const key of [...before.keys()].filter((k) => !after.has(k)).sort()) lines.push(`- removed ${label} \`${key}\``);
  for (const key of [...after.keys()].filter((k) => !before.has(k)).sort()) lines.push(`- added ${label} \`${key}\``);
  for (const key of [...before.keys()].filter((k) => after.has(k) && before.get(k) !== after.get(k)).sort()) {
    lines.push(`- changed ${label} \`${key}\`: ${before.get(key)} -> ${after.get(key)}`);
  }
}

function diffSchemaRef(base, head, before, after, id, kind, lines) {
  const refBefore = before[kind]?.$ref;
  const refAfter = after[kind]?.$ref;
  if (refBefore !== refAfter) lines.push(`- changed ${kind} schema of \`${id}\`: ${refBefore} -> ${refAfter}`);
  if (refBefore && refAfter) diffMaps(fields(base, refBefore), fields(head, refAfter), `${kind} field of \`${id}\``, lines);
}

export function diffDocuments(base, head) {
  const lines = [];
  const baseMethods = walkMethods(base);
  const headMethods = walkMethods(head);
  for (const id of [...baseMethods.keys()].filter((k) => !headMethods.has(k)).sort()) lines.push(`- removed method \`${id}\``);
  for (const id of [...headMethods.keys()].filter((k) => !baseMethods.has(k)).sort()) lines.push(`- added method \`${id}\``);
  for (const [id, before] of baseMethods) {
    const after = headMethods.get(id);
    if (!after) continue;
    const routeBefore = `${before.httpMethod} ${before.flatPath ?? before.path}`;
    const routeAfter = `${after.httpMethod} ${after.flatPath ?? after.path}`;
    if (routeBefore !== routeAfter) lines.push(`- changed route of \`${id}\`: ${routeBefore} -> ${routeAfter}`);
    const params = (m) => new Map(Object.entries(m.parameters ?? {}).map(([k, v]) => [k, signature(v)]));
    diffMaps(params(before), params(after), `parameter of \`${id}\``, lines);
    diffSchemaRef(base, head, before, after, id, 'request', lines);
    diffSchemaRef(base, head, before, after, id, 'response', lines);
  }
  return lines;
}

export function report(baseDir, headDir) {
  const sections = [];
  let drift = false;
  for (const file of readdirSync(baseDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const base = load(baseDir, file);
    const head = load(headDir, file);
    if (!head) {
      sections.push(`## ${file}\n\n- not fetched into ${headDir}\n`);
      continue;
    }
    const lines = diffDocuments(base, head);
    const revision = base.revision === head.revision ? `revision ${base.revision}` : `revision ${base.revision} -> ${head.revision}`;
    if (lines.length === 0) {
      sections.push(`## ${file}\n\n- no contract change (${revision})\n`);
      continue;
    }
    drift = true;
    sections.push(`## ${file}\n\n${revision}\n\n${lines.join('\n')}\n`);
  }
  return { drift, text: sections.join('\n') };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const [baseDir, headDir] = process.argv.slice(2);
  if (!baseDir || !headDir) {
    console.error('usage: discovery-diff.mjs <baseDir> <headDir>');
    process.exit(64);
  }
  const { drift, text } = report(baseDir, headDir);
  console.log(text);
  process.exit(drift ? 2 : 0);
}
