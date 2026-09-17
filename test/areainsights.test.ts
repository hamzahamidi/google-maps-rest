import { describe, expect, it } from 'vitest';
import { computeInsights } from '../src/areainsights/index.js';
import { bodyOf, stubClient } from './helpers.js';

describe('area insights', () => {
  it('posts to the v1 verb path', async () => {
    const { client, calls } = stubClient({ body: { count: '42' } });
    const response = await computeInsights(client, {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { latLng: { latitude: 48.85, longitude: 2.35 }, radius: 1000 } },
        typeFilter: { includedTypes: ['restaurant'] },
      },
    });

    expect(calls[0]!.url).toBe('https://areainsights.googleapis.com/v1:computeInsights');
    expect(response.count).toBe('42');
  });

  // The centre is flat on the circle as a latLng or place oneof. Places nests it
  // under `center`, and reusing that shape here sends a field the API does not define.
  it('puts latLng flat on the circle, with no center wrapper', async () => {
    const { client, calls } = stubClient({ body: {} });
    await computeInsights(client, {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { latLng: { latitude: 1, longitude: 2 }, radius: 500 } },
        typeFilter: { includedTypes: ['cafe'] },
      },
    });

    const body = bodyOf(calls[0]!) as { filter: { locationFilter: { circle: Record<string, unknown> } } };
    expect(body.filter.locationFilter.circle).toEqual({ latLng: { latitude: 1, longitude: 2 }, radius: 500 });
    expect(JSON.stringify(body)).not.toContain('center');
  });

  it('accepts a place as the circle centre instead of coordinates', async () => {
    const { client, calls } = stubClient({ body: {} });
    await computeInsights(client, {
      insights: ['INSIGHT_COUNT'],
      filter: {
        locationFilter: { circle: { place: 'places/abc', radius: 2000 } },
        typeFilter: { includedTypes: ['bar'] },
      },
    });

    const body = bodyOf(calls[0]!) as { filter: { locationFilter: { circle: Record<string, unknown> } } };
    expect(body.filter.locationFilter.circle).toEqual({ place: 'places/abc', radius: 2000 });
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
