import { MapsClient, type FetchLike } from '../src/core/client.js';

export type Captured = { url: string; init: RequestInit | undefined };

export function stubClient(
  respond: { status?: number; body?: unknown } = {},
): { client: MapsClient; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(respond.body ?? {}), {
      status: respond.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return { client: new MapsClient({ apiKey: 'test-key', fetch: fetchImpl }), calls };
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
