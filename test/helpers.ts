import { MapsClient, type FetchLike } from '../src/core/client.js';
import { validateWireRequest } from './contract.js';

export type Captured = { url: string; init: RequestInit | undefined };
export type StubResponse = { status?: number; body?: unknown };
type Stub = { client: MapsClient; calls: Captured[] };

function build(respond: StubResponse, validate: (url: string, init: RequestInit | undefined) => void): Stub {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    validate(url, init);
    calls.push({ url, init });
    return new Response(JSON.stringify(respond.body ?? {}), {
      status: respond.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { client: new MapsClient({ apiKey: 'test-key', fetch: fetchImpl }), calls };
}

/** Every request is checked against the pinned Discovery document for its host before it is recorded. */
export function stubClient(respond: StubResponse = {}): Stub {
  return build(respond, validateWireRequest);
}

/** For transport tests that use invented paths, and for services with no pinned document yet. */
export function rawStubClient(respond: StubResponse = {}): Stub {
  return build(respond, () => undefined);
}

export function headerOf(call: Captured, name: string): string | undefined {
  return (call.init?.headers as Record<string, string> | undefined)?.[name];
}

export function bodyOf(call: Captured): unknown {
  const raw = call.init?.body;
  return typeof raw === 'string' ? JSON.parse(raw) : undefined;
}

export async function rejection<T>(promise: Promise<unknown>): Promise<T> {
  let thrown: unknown;
  let rejected = false;
  await promise.catch((caught: unknown) => {
    thrown = caught;
    rejected = true;
  });
  if (!rejected) throw new Error('expected the call to reject');
  return thrown as T;
}
