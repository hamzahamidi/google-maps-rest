import { MapsError, errorFromResponse } from './errors.js';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type ClientOptions = {
  apiKey: string;
  /** Injected for tests and for runtimes without a global fetch. */
  fetch?: FetchLike;
  timeoutMs?: number;
  /** Rewrites the resolved origin. Intended for tests and proxies. */
  resolveOrigin?: (service: string) => string;
};

export type RequestSpec = {
  /** Subdomain of googleapis.com, e.g. "places" or "weather". */
  service: string;
  path: string;
  method: 'GET' | 'POST';
  query?: QueryInput;
  body?: unknown;
  fieldMask?: readonly string[];
  signal?: AbortSignal;
};

export type QueryValue = string | number | boolean | null | undefined | QueryValue[] | { [key: string]: QueryValue };
export type QueryInput = Record<string, QueryValue>;

/**
 * Google encodes nested request messages as dotted query paths on GET endpoints,
 * e.g. location.latitude=37.42. Repeated fields appear as repeated keys.
 */
export function toSearchParams(query: QueryInput): URLSearchParams {
  const params = new URLSearchParams();

  const walk = (prefix: string, value: QueryValue): void => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(prefix, item);
      return;
    }
    if (typeof value === 'object') {
      for (const [key, nested] of Object.entries(value)) {
        walk(prefix ? `${prefix}.${key}` : key, nested);
      }
      return;
    }
    params.append(prefix, String(value));
  };

  for (const [key, value] of Object.entries(query)) walk(key, value);
  return params;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class MapsClient {
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly resolveOrigin: (service: string) => string;

  constructor(options: ClientOptions) {
    if (!options.apiKey) throw new Error('apiKey is required');
    this.apiKey = options.apiKey;
    this.fetchImpl = options.fetch ?? ((input, init) => globalThis.fetch(input, init));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.resolveOrigin = options.resolveOrigin ?? ((service) => `https://${service}.googleapis.com`);
  }

  async request<T>(spec: RequestSpec): Promise<T> {
    const url = new URL(this.resolveOrigin(spec.service) + spec.path);
    if (spec.query) {
      for (const [key, value] of toSearchParams(spec.query)) url.searchParams.append(key, value);
    }

    const headers: Record<string, string> = { 'X-Goog-Api-Key': this.apiKey };
    if (spec.fieldMask?.length) headers['X-Goog-FieldMask'] = spec.fieldMask.join(',');
    if (spec.body !== undefined) headers['Content-Type'] = 'application/json';

    const signal = spec.signal ?? AbortSignal.timeout(this.timeoutMs);

    const init: RequestInit = { method: spec.method, headers, signal };
    if (spec.body !== undefined) init.body = JSON.stringify(spec.body);

    const response = await this.fetchImpl(url.toString(), init);

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      if (!response.ok) throw new MapsError(text.slice(0, 200), response.status, 'UNKNOWN');
      throw new MapsError('Response was not valid JSON', response.status, 'UNKNOWN', text.slice(0, 200));
    }

    if (!response.ok) throw errorFromResponse(response.status, parsed);
    return parsed as T;
  }
}
