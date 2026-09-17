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

/** fieldMask travels as a header, so it must never reach the query string. */
export function queryOf<T extends object>(request: T): QueryInput {
  const { fieldMask: _fieldMask, ...rest } = request as T & { fieldMask?: unknown };
  return rest as QueryInput;
}

/** AbortSignal.any landed in Node 18.17, and the engines floor is 18. */
function anySignal(signals: AbortSignal[]): AbortSignal {
  if (typeof AbortSignal.any === 'function') return AbortSignal.any(signals);

  const controller = new AbortController();
  const abort = (signal: AbortSignal) => () => {
    controller.abort(signal.reason);
    for (const [other, listener] of listeners) other.removeEventListener('abort', listener);
  };
  const listeners = signals.map((signal) => [signal, abort(signal)] as const);

  for (const [signal, listener] of listeners) {
    if (signal.aborted) {
      listener();
      return controller.signal;
    }
    signal.addEventListener('abort', listener, { once: true });
  }
  return controller.signal;
}

const SNIPPET_LIMIT = 200;

/** A gateway can reflect the request back in its HTML, so the body stays out of the message. */
function nonJsonError(response: Response, text: string): MapsError {
  return new MapsError(
    `Request failed with HTTP ${response.status} and a non-JSON response`,
    response.status,
    'UNKNOWN',
    {
      contentType: response.headers.get('content-type'),
      bodySnippet: text.slice(0, SNIPPET_LIMIT),
      bodyLength: text.length,
    },
  );
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

    const timeout = AbortSignal.timeout(this.timeoutMs);
    const signal = spec.signal ? anySignal([spec.signal, timeout]) : timeout;

    const init: RequestInit = { method: spec.method, headers, signal };
    if (spec.body !== undefined) init.body = JSON.stringify(spec.body);

    const response = await this.fetchImpl(url.toString(), init);

    const text = await response.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : {};
    } catch {
      throw nonJsonError(response, text);
    }

    if (!response.ok) throw errorFromResponse(response.status, parsed);
    return parsed as T;
  }
}
