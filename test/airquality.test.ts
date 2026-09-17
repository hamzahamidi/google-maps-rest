import { describe, expect, it } from 'vitest';
import { currentConditions, forecast, history } from '../src/airquality/index.js';
import { bodyOf, stubClient } from './helpers.js';

describe('air quality', () => {
  it('posts a body rather than query params, unlike the weather lookups', async () => {
    const { client, calls } = stubClient({ body: { indexes: [] } });
    await currentConditions(client, { location: { latitude: 48.85, longitude: 2.35 } });

    expect(calls[0]!.url).toBe('https://airquality.googleapis.com/v1/currentConditions:lookup');
    expect(calls[0]!.init?.method).toBe('POST');
    expect(calls[0]!.url).not.toContain('location.latitude');
    expect(bodyOf(calls[0]!)).toEqual({ location: { latitude: 48.85, longitude: 2.35 } });
  });

  it('passes extra computations through as an array', async () => {
    const { client, calls } = stubClient({ body: {} });
    await currentConditions(client, {
      location: { latitude: 1, longitude: 2 },
      extraComputations: ['HEALTH_RECOMMENDATIONS', 'POLLUTANT_CONCENTRATION'],
      universalAqi: true,
    });

    expect(bodyOf(calls[0]!)).toMatchObject({
      extraComputations: ['HEALTH_RECOMMENDATIONS', 'POLLUTANT_CONCENTRATION'],
      universalAqi: true,
    });
  });

  it('uses a separate path per lookup', async () => {
    const { client, calls } = stubClient({ body: {} });
    await forecast(client, { location: { latitude: 1, longitude: 2 }, pageSize: 3 });
    await history(client, { location: { latitude: 1, longitude: 2 }, hours: 6 });

    expect(calls[0]!.url).toContain('/v1/forecast:lookup');
    expect(calls[1]!.url).toContain('/v1/history:lookup');
    expect(bodyOf(calls[1]!)).toMatchObject({ hours: 6 });
  });
});
