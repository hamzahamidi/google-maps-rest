import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv, { type ValidateFunction } from 'ajv';

export const DISCOVERY_DIR = join(dirname(fileURLToPath(import.meta.url)), 'discovery');

export type DiscoverySchema = {
  type?: string;
  format?: string;
  enum?: string[];
  $ref?: string;
  properties?: Record<string, DiscoverySchema>;
  items?: DiscoverySchema;
  additionalProperties?: DiscoverySchema | boolean;
};

export type DiscoveryParameter = {
  location: 'path' | 'query';
  type?: string;
  format?: string;
  enum?: string[];
  repeated?: boolean;
  required?: boolean;
};

export type DiscoveryMethod = {
  id: string;
  httpMethod: string;
  path: string;
  flatPath?: string;
  parameters?: Record<string, DiscoveryParameter>;
  request?: { $ref: string };
};

export type DiscoveryResource = {
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
};

export type DiscoveryDocument = {
  name: string;
  version: string;
  revision?: string;
  rootUrl: string;
  methods?: Record<string, DiscoveryMethod>;
  resources?: Record<string, DiscoveryResource>;
  schemas?: Record<string, DiscoverySchema>;
};

export class ContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractError';
  }
}

type CompiledMethod = {
  id: string;
  httpMethod: string;
  route: string;
  pattern: RegExp;
  query: Record<string, DiscoveryParameter>;
  validateBody: ValidateFunction | undefined;
};

export type Contract = { document: DiscoveryDocument; methods: CompiledMethod[] };

export function toJsonSchema(node: DiscoverySchema): Record<string, unknown> {
  if (node.$ref) return { $ref: `#/definitions/${node.$ref}` };
  switch (node.type) {
    case 'object': {
      const properties = Object.fromEntries(
        Object.entries(node.properties ?? {}).map(([key, value]) => [key, toJsonSchema(value)]),
      );
      const additional =
        node.additionalProperties === undefined
          ? false
          : typeof node.additionalProperties === 'boolean'
            ? node.additionalProperties
            : toJsonSchema(node.additionalProperties);
      return { type: 'object', properties, additionalProperties: additional };
    }
    case 'array':
      return { type: 'array', items: node.items ? toJsonSchema(node.items) : {} };
    case 'string':
      return node.enum ? { type: 'string', enum: node.enum } : { type: 'string' };
    case 'integer':
    case 'number':
    case 'boolean':
      return { type: node.type };
    default:
      return {};
  }
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Discovery's `path` uses reserved expansion such as `v1/{+name}`; `flatPath` spells the segments out. */
function compilePattern(route: string): RegExp {
  const source = route
    .split(/(\{[^}]+\})/)
    .map((part) => (part.startsWith('{') ? '[^/]+' : escapeRegExp(part)))
    .join('');
  return new RegExp(`^/${source}$`);
}

function* walkMethods(document: DiscoveryDocument): Generator<DiscoveryMethod> {
  yield* Object.values(document.methods ?? {});
  const walk = function* (resources: Record<string, DiscoveryResource> | undefined): Generator<DiscoveryMethod> {
    for (const resource of Object.values(resources ?? {})) {
      yield* Object.values(resource.methods ?? {});
      yield* walk(resource.resources);
    }
  };
  yield* walk(document.resources);
}

export function compileContract(document: DiscoveryDocument): Contract {
  const definitions = Object.fromEntries(
    Object.entries(document.schemas ?? {}).map(([name, schema]) => [name, toJsonSchema(schema)]),
  );
  const ajv = new Ajv({ allErrors: true, strict: false });
  const methods: CompiledMethod[] = [];
  for (const method of walkMethods(document)) {
    const route = method.flatPath ?? method.path;
    const query = Object.fromEntries(
      Object.entries(method.parameters ?? {}).filter(([, parameter]) => parameter.location === 'query'),
    );
    const ref = method.request?.$ref;
    if (ref && !definitions[ref]) throw new ContractError(`${method.id} requests schema "${ref}", which ${document.name} does not define`);
    const validateBody = ref ? ajv.compile({ $ref: `#/definitions/${ref}`, definitions }) : undefined;
    methods.push({ id: method.id, httpMethod: method.httpMethod, route, pattern: compilePattern(route), query, validateBody });
  }
  return { document, methods };
}

export function loadContracts(dir = DISCOVERY_DIR): Map<string, Contract> {
  const contracts = new Map<string, Contract>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'manifest.json')) {
    const document = JSON.parse(readFileSync(join(dir, file), 'utf8')) as DiscoveryDocument;
    contracts.set(new URL(document.rootUrl).hostname, compileContract(document));
  }
  return contracts;
}

let pinned: Map<string, Contract> | undefined;

function describeAjvErrors(validate: ValidateFunction): string {
  return (validate.errors ?? [])
    .map((e) => `${e.instancePath || '/'} ${e.message ?? ''}${e.params && 'additionalProperty' in e.params ? ` (${String(e.params.additionalProperty)})` : ''}`)
    .join('; ');
}

function checkScalar(id: string, name: string, parameter: DiscoveryParameter, value: string): void {
  const fail = (expected: string) => new ContractError(`${id}: query parameter "${name}" expects ${expected}, got "${value}"`);
  if (parameter.enum && !parameter.enum.includes(value)) throw fail(`one of ${parameter.enum.join(', ')}`);
  if (parameter.type === 'integer' && !/^-?\d+$/.test(value)) throw fail('an integer');
  if (parameter.type === 'number' && !Number.isFinite(Number(value))) throw fail('a number');
  if (parameter.type === 'boolean' && value !== 'true' && value !== 'false') throw fail('a boolean');
}

function checkQuery(method: CompiledMethod, params: URLSearchParams): void {
  const seen = new Set<string>();
  for (const name of params.keys()) {
    if (seen.has(name)) continue;
    seen.add(name);
    const parameter = method.query[name];
    if (!parameter) throw new ContractError(`${method.id} does not declare query parameter "${name}"`);
    const values = params.getAll(name);
    if (values.length > 1 && !parameter.repeated) throw new ContractError(`${method.id}: query parameter "${name}" is not repeated, got ${values.length} values`);
    for (const value of values) checkScalar(method.id, name, parameter, value);
  }
  for (const [name, parameter] of Object.entries(method.query)) {
    if (parameter.required && !seen.has(name)) throw new ContractError(`${method.id} requires query parameter "${name}"`);
  }
}

function checkBody(method: CompiledMethod, body: BodyInit | null | undefined): void {
  if (!method.validateBody) {
    if (body !== undefined && body !== null) throw new ContractError(`${method.id} takes no request body`);
    return;
  }
  if (typeof body !== 'string') throw new ContractError(`${method.id} requires a JSON request body`);
  if (!method.validateBody(JSON.parse(body))) {
    throw new ContractError(`${method.id} request body: ${describeAjvErrors(method.validateBody)}`);
  }
}

export function validateWireRequest(url: string, init: RequestInit | undefined, contracts?: Map<string, Contract>): void {
  const parsed = new URL(url);
  const contract = (contracts ?? (pinned ??= loadContracts())).get(parsed.hostname);
  if (!contract) throw new ContractError(`no pinned Discovery document for ${parsed.hostname}`);
  const verb = (init?.method ?? 'GET').toUpperCase();
  const matches = contract.methods.filter((m) => m.httpMethod === verb && m.pattern.test(parsed.pathname));
  if (matches.length !== 1) {
    const detail = matches.length ? `matches ${matches.length} methods: ${matches.map((m) => m.id).join(', ')}` : `matches no method of ${contract.document.name}`;
    throw new ContractError(`${verb} ${parsed.pathname} ${detail}`);
  }
  const method = matches[0]!;
  checkQuery(method, parsed.searchParams);
  checkBody(method, init?.body);
}
