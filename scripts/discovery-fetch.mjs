#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const VERSIONS = {
  places: 'v1',
  routes: 'v2',
  geocode: 'v4',
  weather: 'v1',
  addressvalidation: 'v1',
  airquality: 'v1',
  pollen: 'v1',
  solar: 'v1',
  areainsights: 'v1',
};

const KEEP = ['name', 'version', 'revision', 'rootUrl', 'servicePath', 'parameters', 'methods', 'resources', 'schemas'];

const args = process.argv.slice(2);
const outIndex = args.indexOf('--out');
const outDir = outIndex >= 0 ? args[outIndex + 1] : 'test/discovery';
const services = args.filter((arg, i) => !arg.startsWith('--') && (outIndex < 0 || i !== outIndex + 1));
const targets = services.length ? services : Object.keys(VERSIONS);
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

export function stableStringify(value, indent = '') {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = indent + '  ';
    return `[\n${value.map((v) => inner + stableStringify(v, inner)).join(',\n')}\n${indent}]`;
  }
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    if (keys.length === 0) return '{}';
    const inner = indent + '  ';
    return `{\n${keys.map((k) => `${inner}${JSON.stringify(k)}: ${stableStringify(value[k], inner)}`).join(',\n')}\n${indent}}`;
  }
  return JSON.stringify(value);
}

function trim(document) {
  return Object.fromEntries(KEEP.filter((key) => key in document).map((key) => [key, document[key]]));
}

async function fetchOne(service) {
  const version = VERSIONS[service];
  if (!version) throw new Error(`unknown service "${service}"; known: ${Object.keys(VERSIONS).join(', ')}`);
  const source = `https://${service}.googleapis.com/$discovery/rest?version=${version}`;
  const headers = apiKey ? { 'X-Goog-Api-Key': apiKey } : {};
  const response = await fetch(source, { headers });
  if (response.status === 403 && !apiKey) {
    throw new Error(`${service}: HTTP 403 without a key. Set GOOGLE_MAPS_API_KEY and rerun for this service.`);
  }
  if (!response.ok) throw new Error(`${service}: HTTP ${response.status} from ${source}`);
  return { source, document: trim(await response.json()) };
}

mkdirSync(outDir, { recursive: true });
const manifestPath = join(outDir, 'manifest.json');
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
const failures = [];

for (const service of targets) {
  try {
    const { source, document } = await fetchOne(service);
    const file = `${service}.json`;
    const text = stableStringify(document) + '\n';
    const sha256 = createHash('sha256').update(text).digest('hex');
    const previous = manifest[file];
    writeFileSync(join(outDir, file), text);
    if (previous?.sha256 !== sha256) {
      manifest[file] = {
        source,
        name: document.name,
        version: document.version,
        revision: document.revision,
        sha256,
        fetchedAt: new Date().toISOString(),
      };
    }
    const state = previous ? (previous.sha256 === sha256 ? 'unchanged' : `changed (${previous.revision} -> ${document.revision})`) : 'new';
    console.log(`${service.padEnd(18)} revision ${document.revision}  ${(text.length / 1024).toFixed(0)} kB  ${state}`);
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
}

writeFileSync(manifestPath, stableStringify(manifest) + '\n');

for (const failure of failures) console.error(`FAILED  ${failure}`);
process.exit(failures.length ? 1 : 0);
