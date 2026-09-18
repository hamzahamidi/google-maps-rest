import { describe, expect, it } from 'vitest';
import { findClosestBuildingInsights, getDataLayers } from '../src/solar/index.js';
import { stubClient } from './helpers.js';

describe('solar', () => {
  it('flattens the location for building insights', async () => {
    const { client, calls } = stubClient({ body: { name: 'buildings/x' } });
    await findClosestBuildingInsights(client, { location: { latitude: 37.42, longitude: -122.08 } });

    expect(calls[0]!.url).toContain('https://solar.googleapis.com/v1/buildingInsights:findClosest');
    expect(calls[0]!.url).toContain('location.latitude=37.42');
    expect(calls[0]!.init?.method).toBe('GET');
  });

  it('repeats experiments rather than joining them', async () => {
    const { client, calls } = stubClient({ body: {} });
    await findClosestBuildingInsights(client, {
      location: { latitude: 1, longitude: 2 },
      experiments: ['EXPANDED_COVERAGE', 'EXPERIMENT_UNSPECIFIED'],
    });

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.getAll('experiments')).toEqual(['EXPANDED_COVERAGE', 'EXPERIMENT_UNSPECIFIED']);
  });

  it('sends the data layer radius and view', async () => {
    const { client, calls } = stubClient({ body: {} });
    await getDataLayers(client, {
      location: { latitude: 1, longitude: 2 },
      radiusMeters: 50,
      view: 'FULL_LAYERS',
      requiredQuality: 'HIGH',
    });

    expect(calls[0]!.url).toContain('/v1/dataLayers:get');
    expect(calls[0]!.url).toContain('radiusMeters=50');
    expect(calls[0]!.url).toContain('view=FULL_LAYERS');
    expect(calls[0]!.url).toContain('requiredQuality=HIGH');
  });
});
