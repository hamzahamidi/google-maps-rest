import { describe, expect, it } from 'vitest';
import { autocomplete, billingTierFor, getPlace, searchNearby, searchText } from '../src/places/index.js';
import { computeRouteMatrix, computeRoutes } from '../src/routes/index.js';
import { geocodeAddress, geocodeLocation, geocodePlace } from '../src/geocode/index.js';
import { currentConditions, forecastDays } from '../src/weather/index.js';
import { bodyOf, headerOf, stubClient } from './helpers.js';

describe('places', () => {
  it('roots the search field mask at places., because results are nested there', async () => {
    const { client, calls } = stubClient({ body: { places: [] } });
    await searchText(client, { textQuery: 'pizza', fieldMask: ['id', 'displayName'] });

    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('places.id,places.displayName');
  });

  it('leaves an already rooted search mask alone', async () => {
    const { client, calls } = stubClient({ body: { places: [] } });
    await searchNearby(client, {
      locationRestriction: { circle: { center: { latitude: 1, longitude: 2 }, radius: 500 } },
      fieldMask: ['places.id'],
    });

    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('places.id');
  });

  it('keeps the details field mask bare, because that response is not nested', async () => {
    const { client, calls } = stubClient({ body: { id: 'abc' } });
    await getPlace(client, { placeId: 'abc', fieldMask: ['id', 'location'] });

    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('id,location');
    expect(calls[0]!.url).toContain('/v1/places/abc');
  });

  it('accepts a place id with or without the resource prefix', async () => {
    const { client, calls } = stubClient({ body: {} });
    await getPlace(client, { placeId: 'places/abc', fieldMask: ['id'] });

    expect(calls[0]!.url).toContain('/v1/places/abc');
    expect(calls[0]!.url).not.toContain('places/places');
  });

  it('sends the field mask out of the body, not inside it', async () => {
    const { client, calls } = stubClient({ body: { places: [] } });
    await searchText(client, { textQuery: 'pizza', fieldMask: ['id'] });

    expect(bodyOf(calls[0]!)).toEqual({ textQuery: 'pizza' });
  });

  it('passes the session token through on autocomplete', async () => {
    const { client, calls } = stubClient({ body: { suggestions: [] } });
    await autocomplete(client, { input: 'par', sessionToken: 'abc-123' });

    expect(bodyOf(calls[0]!)).toMatchObject({ input: 'par', sessionToken: 'abc-123' });
    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBeUndefined();
  });
});

describe('billingTierFor', () => {
  it('bills the highest tier present, since that one applies to the whole call', () => {
    expect(billingTierFor('getPlace', ['id']).tier).toBe('ESSENTIALS_IDS_ONLY');
    expect(billingTierFor('getPlace', ['id', 'location']).tier).toBe('ESSENTIALS');
    expect(billingTierFor('getPlace', ['id', 'displayName']).tier).toBe('PRO');
    expect(billingTierFor('getPlace', ['id', 'location', 'rating']).tier).toBe('ENTERPRISE');
    expect(billingTierFor('getPlace', ['id', 'reviews']).tier).toBe('ENTERPRISE_ATMOSPHERE');
  });

  it('prices the same field differently per method, which is why the method is required', () => {
    expect(billingTierFor('getPlace', ['photos']).tier).toBe('ESSENTIALS_IDS_ONLY');
    expect(billingTierFor('searchText', ['photos']).tier).toBe('PRO');

    expect(billingTierFor('getPlace', ['location']).tier).toBe('ESSENTIALS');
    expect(billingTierFor('searchText', ['location']).tier).toBe('PRO');
  });

  it('knows Nearby Search has no tier below Pro', () => {
    expect(billingTierFor('searchNearby', ['id']).tier).toBe('PRO');
    expect(billingTierFor('searchNearby', ['id', 'name', 'attributions']).tier).toBe('PRO');
  });

  it('knows Text Search has no Essentials tier', () => {
    expect(billingTierFor('searchText', ['id']).tier).toBe('ESSENTIALS_IDS_ONLY');
    expect(billingTierFor('searchText', ['formattedAddress']).tier).toBe('PRO');
  });

  it('reads through a places. prefix', () => {
    expect(billingTierFor('searchText', ['places.rating']).tier).toBe('ENTERPRISE');
  });

  // Reporting an unrecognised field as the cheapest tier is the dangerous direction
  // to be wrong in, so the caller is told rather than quietly given a low number.
  it('reports unrecognised fields instead of pricing them as the cheapest tier', () => {
    const estimate = billingTierFor('getPlace', ['id', 'somethingGoogleAddedLater']);

    expect(estimate.unclassified).toEqual(['somethingGoogleAddedLater']);
    expect(estimate.tier).toBe('ESSENTIALS_IDS_ONLY');
  });

  it('returns a null tier when nothing in the mask is recognised', () => {
    expect(billingTierFor('getPlace', ['whoKnows']).tier).toBeNull();
  });

  it('bills a wildcard at the top tier the method offers', () => {
    expect(billingTierFor('getPlace', ['*']).tier).toBe('ENTERPRISE_ATMOSPHERE');
    expect(billingTierFor('searchNearby', ['*']).tier).toBe('ENTERPRISE_ATMOSPHERE');
  });
});

describe('routes', () => {
  it('roots the mask at routes. and posts to the v2 path', async () => {
    const { client, calls } = stubClient({ body: { routes: [] } });
    await computeRoutes(client, {
      origin: { address: 'a' },
      destination: { address: 'b' },
      fieldMask: ['duration', 'distanceMeters'],
    });

    expect(calls[0]!.url).toContain('https://routes.googleapis.com/directions/v2:computeRoutes');
    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('routes.duration,routes.distanceMeters');
    expect(bodyOf(calls[0]!)).toEqual({ origin: { address: 'a' }, destination: { address: 'b' } });
  });

  it('leaves the matrix mask unrooted, because that response is a flat list', async () => {
    const { client, calls } = stubClient({ body: [] });
    await computeRouteMatrix(client, {
      origins: [{ waypoint: { address: 'a' } }],
      destinations: [{ waypoint: { address: 'b' } }],
      fieldMask: ['originIndex', 'duration'],
    });

    expect(calls[0]!.url).toContain('/distanceMatrix/v2:computeRouteMatrix');
    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toBe('originIndex,duration');
  });
});

describe('geocode v4', () => {
  it('sends the address query on the v4 path', async () => {
    const { client, calls } = stubClient({ body: { results: [] } });
    await geocodeAddress(client, { addressQuery: '1600 Amphitheatre Parkway' });

    expect(calls[0]!.url).toContain('https://geocode.googleapis.com/v4/geocode/address');
    expect(calls[0]!.url).toContain('addressQuery=1600+Amphitheatre+Parkway');
  });

  it('flattens the reverse lookup location into dotted params', async () => {
    const { client, calls } = stubClient({ body: { results: [] } });
    await geocodeLocation(client, { location: { latitude: 37.42, longitude: -122.08 } });

    expect(calls[0]!.url).toContain('location.latitude=37.42');
    expect(calls[0]!.url).toContain('location.longitude=-122.08');
  });

  it('strips the resource prefix from a place lookup', async () => {
    const { client, calls } = stubClient({ body: { results: [] } });
    await geocodePlace(client, { placeId: 'places/xyz' });

    expect(calls[0]!.url).toContain('/v4/geocode/places/xyz');
  });
});

describe('weather', () => {
  it('builds a GET with dotted location params and no body', async () => {
    const { client, calls } = stubClient({ body: {} });
    await currentConditions(client, { location: { latitude: 37.42, longitude: -122.08 } });

    expect(calls[0]!.init?.method).toBe('GET');
    expect(calls[0]!.init?.body).toBeUndefined();
    expect(calls[0]!.url).toContain('https://weather.googleapis.com/v1/currentConditions:lookup');
    expect(calls[0]!.url).toContain('location.latitude=37.42');
  });

  it('sends the key as a header even though the docs show a query param', async () => {
    const { client, calls } = stubClient({ body: {} });
    await currentConditions(client, { location: { latitude: 1, longitude: 2 } });

    expect(headerOf(calls[0]!, 'X-Goog-Api-Key')).toBe('test-key');
    expect(calls[0]!.url).not.toContain('key=test-key');
  });

  it('passes forecast paging options through', async () => {
    const { client, calls } = stubClient({ body: {} });
    await forecastDays(client, { location: { latitude: 1, longitude: 2 }, days: 5, pageSize: 3 });

    expect(calls[0]!.url).toContain('days=5');
    expect(calls[0]!.url).toContain('pageSize=3');
  });
});

describe('field masks never reach the query string', () => {
  it('keeps fieldMask out of a GET url even when a request type grows one', async () => {
    const { client, calls } = stubClient({ body: { results: [] } });
    const request = { addressQuery: 'x', fieldMask: ['location'] } as Parameters<typeof geocodeAddress>[1];
    await geocodeAddress(client, request);

    expect(calls[0]!.url).not.toContain('fieldMask');
    expect(calls[0]!.url).toContain('addressQuery=x');
  });

  it('does the same for weather lookups', async () => {
    const { client, calls } = stubClient({ body: {} });
    const request = {
      location: { latitude: 1, longitude: 2 },
      fieldMask: ['temperature'],
    } as Parameters<typeof currentConditions>[1];
    await currentConditions(client, request);

    expect(calls[0]!.url).not.toContain('fieldMask');
  });
});
