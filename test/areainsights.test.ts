import { describe, expect, it } from 'vitest';
import { computeInsights } from '../src/areainsights/index.js';
import { bodyOf, stubClient } from './helpers.js';

describe('area insights', () => {
  it('posts to the v1 verb path', async () => {
    const { client, calls } = stubClient({ body: { count: '42' } });
    const response = await computeInsights(client, {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { center: { latitude: 48.85, longitude: 2.35 }, radius: 1000 } },
        typeFilter: { includedTypes: ['restaurant'] },
      },
    });

    expect(calls[0]!.url).toBe('https://areainsights.googleapis.com/v1:computeInsights');
    expect(response.count).toBe('42');
  });

  it('keeps count a string, because the wire format is int64', async () => {
    const { client } = stubClient({ body: { count: '9007199254740993' } });
    const response = await computeInsights(client, {
      insights: ['INSIGHT_COUNT'],
      filter: { locationFilter: { region: { place: 'places/x' } }, typeFilter: { includedTypes: ['cafe'] } },
    });

    expect(response.count).toBe('9007199254740993');
    expect(typeof response.count).toBe('string');
  });

  it('sends the filter unchanged', async () => {
    const { client, calls } = stubClient({ body: {} });
    const filter = {
      locationFilter: { region: { place: 'places/abc' } },
      typeFilter: { includedTypes: ['bar'], excludedTypes: ['night_club'] },
      operatingStatus: ['OPERATING_STATUS_OPERATIONAL' as const],
    };
    await computeInsights(client, { insights: ['INSIGHT_PLACES'], filter });

    expect(bodyOf(calls[0]!)).toEqual({ insights: ['INSIGHT_PLACES'], filter });
  });
});
