import { describe, expect, it } from 'vitest';
import { forecast } from '../src/pollen/index.js';
import { headerOf, stubClient } from './helpers.js';

describe('pollen', () => {
  it('builds a GET with dotted location params', async () => {
    const { client, calls } = stubClient({ body: { dailyInfo: [] } });
    await forecast(client, { location: { latitude: 48.85, longitude: 2.35 }, days: 3 });

    expect(calls[0]!.init?.method).toBe('GET');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(calls[0]!.url).toContain('https://pollen.googleapis.com/v1/forecast:lookup');
    expect(calls[0]!.url).toContain('location.latitude=48.85');
    expect(calls[0]!.url).toContain('location.longitude=2.35');
    expect(calls[0]!.url).toContain('days=3');
  });

  it('sends the key as a header, not a query param', async () => {
    const { client, calls } = stubClient({ body: {} });
    await forecast(client, { location: { latitude: 1, longitude: 2 }, days: 1 });

    expect(headerOf(calls[0]!, 'X-Goog-Api-Key')).toBe('test-key');
    expect(calls[0]!.url).not.toContain('key=test-key');
  });

  it('passes paging and the plant description flag', async () => {
    const { client, calls } = stubClient({ body: {} });
    await forecast(client, {
      location: { latitude: 1, longitude: 2 },
      days: 5,
      plantsDescription: true,
      pageSize: 2,
      pageToken: 'tok',
    });

    expect(calls[0]!.url).toContain('plantsDescription=true');
    expect(calls[0]!.url).toContain('pageSize=2');
    expect(calls[0]!.url).toContain('pageToken=tok');
  });
});
