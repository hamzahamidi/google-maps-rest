import { describe, expect, it } from 'vitest';
import { autocomplete, billingTierFor, getPlace, searchNearby, searchText } from '../src/places/index.js';
import { computeRouteMatrix, computeRoutes } from '../src/routes/index.js';
import { geocodeAddress, geocodeLocation, geocodePlace } from '../src/geocode/index.js';
import { currentConditions, forecastDays } from '../src/weather/index.js';
import { bodyOf, headerOf, rawStubClient, stubClient } from './helpers.js';

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

  // Pricing an unrecognised field as the cheapest tier is the dangerous way to be wrong.
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
    const { client, calls } = rawStubClient({ body: { routes: [] } });
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
    const { client, calls } = rawStubClient({ body: [] });
    await computeRouteMatrix(client, {
      origins: [{ waypoint: { address: 'a' } }],
      destinations: [{ waypoint: { address: 'b' } }],
      fieldMask: ['duration'],
    });

    expect(calls[0]!.url).toContain('/distanceMatrix/v2:computeRouteMatrix');
    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).toContain('duration');
    expect(headerOf(calls[0]!, 'X-Goog-FieldMask')).not.toContain('routes.');
  });

  // Without the indexes an element cannot be mapped back to its inputs, and without
  // status a failed element reads the same as one that simply has no route.
  it('always asks for the matrix diagnostic and index fields', async () => {
    const { client, calls } = rawStubClient({ body: [] });
    await computeRouteMatrix(client, {
      origins: [{ waypoint: { address: 'a' } }],
      destinations: [{ waypoint: { address: 'b' } }],
      fieldMask: ['duration'],
    });

    const mask = headerOf(calls[0]!, 'X-Goog-FieldMask')!.split(',');
    expect(mask).toEqual(['duration', 'originIndex', 'destinationIndex', 'status', 'condition']);
  });

  it('does not duplicate a diagnostic field the caller already asked for', async () => {
    const { client, calls } = rawStubClient({ body: [] });
    await computeRouteMatrix(client, {
      origins: [{ waypoint: { address: 'a' } }],
      destinations: [{ waypoint: { address: 'b' } }],
      fieldMask: ['status', 'duration'],
    });

    const mask = headerOf(calls[0]!, 'X-Goog-FieldMask')!.split(',');
    expect(mask.filter((f) => f === 'status')).toHaveLength(1);
  });
});

describe('geocode v4', () => {
  it('sends the address query on the v4 path', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeAddress(client, { addressQuery: '1600 Amphitheatre Parkway' });

    expect(calls[0]!.url).toContain('https://geocode.googleapis.com/v4/geocode/address');
    expect(calls[0]!.url).toContain('addressQuery=1600+Amphitheatre+Parkway');
  });

  it('flattens the reverse lookup location into dotted params', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeLocation(client, { location: { latitude: 37.42, longitude: -122.08 } });

    expect(calls[0]!.url).toContain('location.latitude=37.42');
    expect(calls[0]!.url).toContain('location.longitude=-122.08');
  });

  // includeTypes is ignored rather than rejected, so the filter reads as applied.
  it('sends the reverse lookup type filter as types', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeLocation(client, {
      location: { latitude: 1, longitude: 2 },
      types: ['street_address', 'premise'],
      granularity: ['ROOFTOP'],
    });

    const url = new URL(calls[0]!.url);
    expect(url.searchParams.getAll('types')).toEqual(['street_address', 'premise']);
    expect(url.searchParams.getAll('granularity')).toEqual(['ROOFTOP']);
    expect(calls[0]!.url).not.toContain('includeTypes');
  });

  it('accepts the lat,lng string form of the reverse lookup', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeLocation(client, { locationQuery: '64.7611872,-18.4705364' });

    expect(calls[0]!.url).toContain('locationQuery=64.7611872%2C-18.4705364');
  });

  it('biases the address lookup by rectangle, the only form on the wire', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeAddress(client, {
      addressQuery: 'rue de Rivoli',
      locationBias: { rectangle: { low: { latitude: 48.8, longitude: 2.3 }, high: { latitude: 48.9, longitude: 2.4 } } },
    });

    expect(calls[0]!.url).toContain('locationBias.rectangle.low.latitude=48.8');
    expect(calls[0]!.url).toContain('locationBias.rectangle.high.longitude=2.4');
  });

  it('accepts a structured postal address instead of a query string', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
    await geocodeAddress(client, { address: { regionCode: 'FR', addressLines: ['1 rue de Rivoli'] } });

    expect(calls[0]!.url).toContain('address.regionCode=FR');
    expect(calls[0]!.url).toContain('address.addressLines=1+rue+de+Rivoli');
  });

  it('strips the resource prefix from a place lookup', async () => {
    const { client, calls } = rawStubClient({ body: { results: [] } });
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
    const { client, calls } = rawStubClient({ body: { results: [] } });
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

describe('places pagination', () => {
  it('sends the Text Search page fields and surfaces the next token', async () => {
    const { client, calls } = stubClient({ body: { places: [], nextPageToken: 'tok2' } });
    const response = await searchText(client, {
      textQuery: 'coffee',
      fieldMask: ['id'],
      pageSize: 20,
      pageToken: 'tok1',
    });

    expect(bodyOf(calls[0]!)).toMatchObject({ pageSize: 20, pageToken: 'tok1' });
    expect(response.nextPageToken).toBe('tok2');
  });

  it('leaves Nearby Search on maxResultCount', async () => {
    const { client, calls } = stubClient({ body: { places: [] } });
    await searchNearby(client, {
      locationRestriction: { circle: { center: { latitude: 1, longitude: 2 }, radius: 100 } },
      fieldMask: ['id'],
      maxResultCount: 5,
    });

    expect(bodyOf(calls[0]!)).toMatchObject({ maxResultCount: 5 });
  });
});
