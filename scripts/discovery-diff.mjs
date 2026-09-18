#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [baseDir, headDir] = process.argv.slice(2);
if (!baseDir || !headDir) {
  console.error('usage: discovery-diff.mjs <baseDir> <headDir>');
  process.exit(64);
}

function load(dir, file) {
  const path = join(dir, file);
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : undefined;
}

function walkMethods(document) {
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

function signature(node) {
  return JSON.stringify({ type: node.type, format: node.format, enum: node.enum, repeated: node.repeated, required: node.required });
}

/** Flattens a request schema into dotted field paths so that a renamed or retyped field reads as one line. */
function fields(document, ref, prefix = '', seen = new Set()) {
  const schema = document.schemas?.[ref];
  if (!schema || seen.has(ref)) return new Map();
  seen.add(ref);
  const out = new Map();
  for (const [name, prop] of Object.entries(schema.properties ?? {})) {
    const path = prefix ? `${prefix}.${name}` : name;
    const target = prop.$ref ?? prop.items?.$ref;
    out.set(path, signature(prop.items ?? prop));
    if (target) for (const [k, v] of fields(document, target, path, new Set(seen))) out.set(k, v);
  }
  return out;
}

function diffMaps(before, after, label, lines) {
  for (const key of [...before.keys()].filter((k) => !after.has(k)).sort()) lines.push(`- removed ${label} \`${key}\``);
  for (const key of [...after.keys()].filter((k) => !before.has(k)).sort()) lines.push(`- added ${label} \`${key}\``);
  for (const key of [...before.keys()].filter((k) => after.has(k) && before.get(k) !== after.get(k)).sort()) {
    lines.push(`- changed ${label} \`${key}\`: ${before.get(key)} -> ${after.get(key)}`);
  }
}

function diffDocuments(base, head) {
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
    const requestBefore = before.request?.$ref;
    const requestAfter = after.request?.$ref;
    if (requestBefore !== requestAfter) lines.push(`- changed request schema of \`${id}\`: ${requestBefore} -> ${requestAfter}`);
    if (requestBefore && requestAfter) {
      diffMaps(fields(base, requestBefore), fields(head, requestAfter), `request field of \`${id}\``, lines);
    }
  }
  return lines;
}

const files = readdirSync(baseDir).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
let drift = false;
for (const file of files) {
  const base = load(baseDir, file);
  const head = load(headDir, file);
  if (!head) {
    console.log(`## ${file}\n\n- not fetched into ${headDir}\n`);
    continue;
  }
  const lines = diffDocuments(base, head);
  const revision = base.revision === head.revision ? `revision ${base.revision}` : `revision ${base.revision} -> ${head.revision}`;
  if (lines.length === 0) {
    console.log(`## ${file}\n\n- no contract change (${revision})\n`);
    continue;
  }
  drift = true;
  console.log(`## ${file}\n\n${revision}\n\n${lines.join('\n')}\n`);
}
process.exit(drift ? 2 : 0);
