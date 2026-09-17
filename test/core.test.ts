import { describe, expect, it } from 'vitest';
import { MapsClient, toSearchParams } from '../src/core/client.js';
import { MapsAuthError, MapsInvalidRequestError, MapsQuotaError, MapsError } from '../src/core/errors.js';
import { bodyOf, headerOf, rejection, stubClient } from './helpers.js';

describe('toSearchParams', () => {
  it('flattens nested objects into dotted paths', () => {
    const params = toSearchParams({ location: { latitude: 37.42, longitude: -122.08 } });
    expect(params.get('location.latitude')).toBe('37.42');
    expect(params.get('location.longitude')).toBe('-122.08');
  });

  it('repeats the key for array values', () => {
    const params = toSearchParams({ includeTypes: ['street_address', 'premise'] });
    expect(params.getAll('includeTypes')).toEqual(['street_address', 'premise']);
  });

  it('drops null and undefined', () => {
    const params = toSearchParams({ a: undefined, b: null, c: 'kept' });
    expect([...params.keys()]).toEqual(['c']);
  });
});

describe('MapsClient', () => {
  it('requires an api key', () => {
    expect(() => new MapsClient({ apiKey: '' })).toThrow('apiKey is required');
  });

  it('sends the key in the X-Goog-Api-Key header, never the query string', async () => {
    const { client, calls } = stubClient();
    await client.request({ service: 'places', path: '/v1/places:searchText', method: 'POST', body: {} });

    expect(headerOf(calls[0]!, 'X-Goog-Api-Key')).toBe('test-key');
    expect(calls[0]!.url).not.toContain('key=');
  });

  it('resolves the origin from the service name', async () => {
    const { client, calls } = stubClient();
    await client.request({ service: 'weather', path: '/v1/currentConditions:lookup', method: 'GET' });

    expect(calls[0]!.url).toContain('https://weather.googleapis.com/v1/currentConditions:lookup');
  });

  it('sets the field mask header only when fields are given', async () => {
    const { client, calls } = stubClient();
    await client.request({ service: 'places', path: '/p', method: 'GET', fieldMask: ['id', 'location'] });
    await client.request({ service: 'places', path: '/p', method: 'GET', fieldMask: [] });

    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('id,location');
    expect(headerOf(calls[1]!, 'X-Goog-FieldMask')).toBeUndefined();
  });

  it('sends a JSON body with a content type, and omits both when there is none', async () => {
    const { client, calls } = stubClient();
    await client.request({ service: 'places', path: '/p', method: 'POST', body: { textQuery: 'pizza' } });
    await client.request({ service: 'places', path: '/p', method: 'GET' });

    expect(bodyOf(calls[0]!)).toEqual({ textQuery: 'pizza' });
    expect(headerOf(calls[0]!, 'Content-Type')).toBe('application/json');
    expect(calls[1]!.init?.body).toBeUndefined();
    expect(headerOf(calls[1]!, 'Content-Type')).toBeUndefined();
  });
});

describe('error mapping', () => {
  const googleError = (status: string, message = 'boom') => ({ error: { status, message } });

  it('maps INVALID_ARGUMENT to MapsInvalidRequestError', async () => {
    const { client } = stubClient({ status: 400, body: googleError('INVALID_ARGUMENT', 'bad mask') });
    await expect(client.request({ service: 'places', path: '/p', method: 'GET' }))
      .rejects.toThrowError(MapsInvalidRequestError);
  });

  it('maps PERMISSION_DENIED and UNAUTHENTICATED to MapsAuthError', async () => {
    for (const status of ['PERMISSION_DENIED', 'UNAUTHENTICATED']) {
      const { client } = stubClient({ status: 403, body: googleError(status) });
      await expect(client.request({ service: 'places', path: '/p', method: 'GET' }))
        .rejects.toThrowError(MapsAuthError);
    }
  });

  it('maps RESOURCE_EXHAUSTED to a retryable quota error', async () => {
    const { client } = stubClient({ status: 429, body: googleError('RESOURCE_EXHAUSTED') });
    const error = await rejection<MapsQuotaError>(
      client.request({ service: 'places', path: '/p', method: 'GET' }),
    );

    expect(error).toBeInstanceOf(MapsQuotaError);
    expect(error.potentiallyRetryable).toBe(true);
  });

  it('keeps the message Google sent', async () => {
    const { client } = stubClient({ status: 400, body: googleError('INVALID_ARGUMENT', 'API key not valid.') });
    await expect(client.request({ service: 'places', path: '/p', method: 'GET' }))
      .rejects.toThrow('API key not valid.');
  });

  it('falls back to the http status when the body carries no error object', async () => {
    const { client } = stubClient({ status: 503, body: {} });
    const error = await rejection<MapsError>(
      client.request({ service: 'places', path: '/p', method: 'GET' }),
    );

    expect(error.status).toBe('UNAVAILABLE');
    expect(error.potentiallyRetryable).toBe(true);
  });

  it('narrows an unlisted status instead of letting it escape the union', async () => {
    const { client } = stubClient({ status: 400, body: { error: { status: 'SOMETHING_NEW', message: 'x' } } });
    const error = await rejection<MapsError>(client.request({ service: 'places', path: '/p', method: 'GET' }));

    expect(error.status).toBe('INVALID_ARGUMENT');
    expect(error.googleStatus).toBe('SOMETHING_NEW');
  });

  it('carries canonical codes that are not in the http fallback table', async () => {
    const { client } = stubClient({ status: 400, body: { error: { status: 'FAILED_PRECONDITION', message: 'x' } } });
    const error = await rejection<MapsError>(client.request({ service: 'places', path: '/p', method: 'GET' }));

    expect(error.status).toBe('FAILED_PRECONDITION');
    expect(error.potentiallyRetryable).toBe(false);
  });

  it('does not treat a 4xx with a non-JSON body as success', async () => {
    const fetchImpl = async () => new Response('<html>nope</html>', { status: 404 });
    const client = new MapsClient({ apiKey: 'k', fetch: fetchImpl });
    await expect(client.request({ service: 'places', path: '/p', method: 'GET' })).rejects.toThrowError(MapsError);
  });
});

describe('abort handling', () => {
  const hangingClient = (signal?: AbortSignal) => {
    const client = new MapsClient({
      apiKey: 'k',
      timeoutMs: 40,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          const signal = init!.signal!;
          if (signal.aborted) return reject(new Error('aborted'));
          signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });
    return client.request({ service: 'places', path: '/p', method: 'GET', ...(signal ? { signal } : {}) });
  };

  it('times out when no caller signal is given', async () => {
    await expect(hangingClient()).rejects.toThrow('aborted');
  });

  // A caller signal used to replace the timeout rather than join it, so passing a
  // shutdown signal silently opted the request out of any deadline.
  it('still times out when the caller supplies a signal that never fires', async () => {
    const never = new AbortController();
    await expect(hangingClient(never.signal)).rejects.toThrow('aborted');
  });

  it('aborts on the caller signal before the timeout', async () => {
    const controller = new AbortController();
    const pending = hangingClient(controller.signal);
    controller.abort();
    await expect(pending).rejects.toThrow('aborted');
  });

  it('aborts immediately on an already-aborted caller signal', async () => {
    await expect(hangingClient(AbortSignal.abort())).rejects.toThrow();
  });
});

// Node 18.0 to 18.16 have no AbortSignal.any, and the engines floor is 18, so the
// fallback is the path a real user on an older runtime takes. CI never hits it.
describe('signal combining without AbortSignal.any', () => {
  const withoutNativeAny = async (run: () => Promise<unknown>) => {
    const native = AbortSignal.any;
    Reflect.deleteProperty(AbortSignal, 'any');
    try {
      await run();
    } finally {
      Object.defineProperty(AbortSignal, 'any', { value: native, configurable: true, writable: true });
    }
  };

  const hanging = (signal: AbortSignal, timeoutMs = 40) => {
    const client = new MapsClient({
      apiKey: 'k',
      timeoutMs,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          const s = init!.signal!;
          if (s.aborted) return reject(new Error('aborted'));
          s.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    });
    return client.request({ service: 'places', path: '/p', method: 'GET', signal });
  };

  it('falls back to a manual combine and still honours the timeout', async () => {
    await withoutNativeAny(async () => {
      const never = new AbortController();
      await expect(hanging(never.signal)).rejects.toThrow('aborted');
    });
  });

  it('falls back and still honours the caller signal', async () => {
    await withoutNativeAny(async () => {
      const controller = new AbortController();
      const pending = hanging(controller.signal, 10_000);
      controller.abort();
      await expect(pending).rejects.toThrow('aborted');
    });
  });

  it('falls back and handles an already-aborted caller signal', async () => {
    await withoutNativeAny(async () => {
      await expect(hanging(AbortSignal.abort(), 10_000)).rejects.toThrow('aborted');
    });
  });
});
