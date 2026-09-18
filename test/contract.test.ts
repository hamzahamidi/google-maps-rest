import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeInsights, type LocationFilter } from '../src/areainsights/index.js';
import { getPlace, searchNearby } from '../src/places/index.js';
import { findClosestBuildingInsights, getDataLayers } from '../src/solar/index.js';
import { forecastDays, forecastHours, historyHours } from '../src/weather/index.js';
import {
  compileContract,
  ContractError,
  DISCOVERY_DIR,
  loadContracts,
  toJsonSchema,
  validateWireRequest,
  type DiscoveryDocument,
} from './contract.js';
import { rejection, stubClient } from './helpers.js';

const contracts = loadContracts();

function synthetic(overrides: Partial<DiscoveryDocument>): Map<string, ReturnType<typeof compileContract>> {
  const document: DiscoveryDocument = {
    name: 'synthetic',
    version: 'v1',
    rootUrl: 'https://synthetic.googleapis.com/',
    ...overrides,
  };
  return new Map([['synthetic.googleapis.com', compileContract(document)]]);
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

describe('pinned documents', () => {
  it('cover every service the contract stub can see', () => {
    expect([...contracts.keys()].sort()).toEqual([
      'addressvalidation.googleapis.com',
      'airquality.googleapis.com',
      'areainsights.googleapis.com',
      'places.googleapis.com',
      'pollen.googleapis.com',
      'solar.googleapis.com',
      'weather.googleapis.com',
    ]);
  });

  it('match the manifest byte for byte', () => {
    const manifest = JSON.parse(readFileSync(join(DISCOVERY_DIR, 'manifest.json'), 'utf8')) as Record<
      string,
      { source: string; revision: string; sha256: string; fetchedAt: string }
    >;
    const files = readdirSync(DISCOVERY_DIR).filter((f) => f.endsWith('.json') && f !== 'manifest.json');
    expect(Object.keys(manifest).sort()).toEqual(files.sort());
    for (const file of files) {
      const sha256 = createHash('sha256').update(readFileSync(join(DISCOVERY_DIR, file))).digest('hex');
      expect(manifest[file]!.sha256, file).toBe(sha256);
      expect(manifest[file]!.source).toMatch(/^https:\/\/[a-z]+\.googleapis\.com\/\$discovery\/rest\?version=v\d$/);
    }
  });
});

describe('the historical regressions fail through the stub', () => {
  it('rejects the Places circle shape on Area Insights', async () => {
    const { client } = stubClient();
    const error = await rejection<ContractError>(
      client.request({
        service: 'areainsights',
        path: '/v1:computeInsights',
        method: 'POST',
        body: {
          insights: ['INSIGHT_COUNT'],
          filter: {
            locationFilter: { circle: { center: { latitude: 1, longitude: 2 }, radius: 500 } },
            typeFilter: { includedTypes: ['cafe'] },
          },
        },
      }),
    );
    expect(error).toBeInstanceOf(ContractError);
    expect(error.message).toMatch(/locationFilter\/circle must NOT have additional properties \(center\)/);
  });

  it('rejects a query parameter the method does not declare', async () => {
    const { client } = stubClient();
    const error = await rejection<ContractError>(
      client.request({
        service: 'weather',
        path: '/v1/currentConditions:lookup',
        method: 'GET',
        query: { location: { latitude: 1, longitude: 2 }, includeTypes: ['premise'] },
      }),
    );
    expect(error.message).toBe('weather.currentConditions.lookup does not declare query parameter "includeTypes"');
  });

  it('rejects an enum value Google does not define', async () => {
    const { client } = stubClient();
    const error = await rejection<ContractError>(
      computeInsights(client, {
        insights: ['INSIGHT_TELEPORTATION' as never],
        filter: { locationFilter: { region: { place: 'places/x' } }, typeFilter: { includedTypes: ['bar'] } },
      }),
    );
    expect(error.message).toMatch(/\/insights\/0 must be equal to one of the allowed values/);
  });
});

describe('method matching', () => {
  it('fails on a host with no pinned document', () => {
    expect(() => validateWireRequest('https://routes.googleapis.com/directions/v2:computeRoutes', post({}))).toThrow(
      'no pinned Discovery document for routes.googleapis.com',
    );
  });

  it('fails on a path no method declares', () => {
    expect(() => validateWireRequest('https://places.googleapis.com/v1/nothing', { method: 'GET' })).toThrow(
      'GET /v1/nothing matches no method of places',
    );
  });

  it('fails on a verb mismatch for a known path', () => {
    expect(() => validateWireRequest('https://places.googleapis.com/v1/places:searchText', { method: 'GET' })).toThrow(
      /matches no method/,
    );
  });

  it('fails when two methods claim the same route', () => {
    const doubled = synthetic({
      methods: {
        a: { id: 'synthetic.a', httpMethod: 'GET', path: 'v1/thing' },
        b: { id: 'synthetic.b', httpMethod: 'GET', path: 'v1/thing' },
      },
    });
    expect(() => validateWireRequest('https://synthetic.googleapis.com/v1/thing', { method: 'GET' }, doubled)).toThrow(
      'GET /v1/thing matches 2 methods: synthetic.a, synthetic.b',
    );
  });

  it('binds one path segment per placeholder and keeps custom verbs literal', async () => {
    const { client, calls } = stubClient({ body: { id: 'x' } });
    await getPlace(client, { placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4', fieldMask: ['id'] });
    expect(calls[0]!.url).toBe('https://places.googleapis.com/v1/places/ChIJN1t_tDeuEmsRUsoyG83frY4');
    expect(() => validateWireRequest('https://places.googleapis.com/v1/places/a/b', { method: 'GET' })).toThrow(
      /matches no method/,
    );
  });

  it('walks nested resources', () => {
    expect(() =>
      validateWireRequest('https://weather.googleapis.com/v1/forecast/days:lookup?location.latitude=1&location.longitude=2', {
        method: 'GET',
      }),
    ).not.toThrow();
  });
});

describe('query parameters', () => {
  const lookup = 'https://weather.googleapis.com/v1/currentConditions:lookup';
  const get = { method: 'GET' };

  it('rejects the key and fields system parameters, since both travel as headers here', () => {
    expect(() => validateWireRequest(`${lookup}?location.latitude=1&location.longitude=2&key=abc`, get)).toThrow(
      'does not declare query parameter "key"',
    );
    expect(() => validateWireRequest(`${lookup}?location.latitude=1&location.longitude=2&fields=id`, get)).toThrow(
      'does not declare query parameter "fields"',
    );
  });

  it('rejects a value outside the declared enum', () => {
    expect(() => validateWireRequest(`${lookup}?location.latitude=1&location.longitude=2&unitsSystem=FURLONGS`, get)).toThrow(
      /"unitsSystem" expects one of .*METRIC/,
    );
  });

  it('rejects a non-numeric value for a number', () => {
    expect(() => validateWireRequest(`${lookup}?location.latitude=abc&location.longitude=2`, get)).toThrow(
      '"location.latitude" expects a number, got "abc"',
    );
  });

  it('rejects a fraction for an integer', () => {
    expect(() =>
      validateWireRequest('https://pollen.googleapis.com/v1/forecast:lookup?location.latitude=1&location.longitude=2&days=1.5', get),
    ).toThrow('"days" expects an integer, got "1.5"');
  });

  it('rejects a singular parameter sent twice', () => {
    expect(() =>
      validateWireRequest(`${lookup}?location.latitude=1&location.longitude=2&languageCode=en&languageCode=fr`, get),
    ).toThrow('"languageCode" is not repeated, got 2 values');
  });

  it('accepts a repeated parameter sent many times', async () => {
    const { client, calls } = stubClient();
    await findClosestBuildingInsights(client, { location: { latitude: 1, longitude: 2 }, experiments: ['EXPANDED_COVERAGE', 'EXPERIMENT_UNSPECIFIED'] });
    expect(new URL(calls[0]!.url).searchParams.getAll('experiments')).toHaveLength(2);
  });

  it('rejects a missing required parameter', () => {
    const strict = synthetic({
      methods: {
        a: {
          id: 'synthetic.a',
          httpMethod: 'GET',
          path: 'v1/thing',
          parameters: { id: { location: 'query', type: 'string', required: true } },
        },
      },
    });
    expect(() => validateWireRequest('https://synthetic.googleapis.com/v1/thing', { method: 'GET' }, strict)).toThrow(
      'synthetic.a requires query parameter "id"',
    );
  });

  it('rejects a boolean that is not true or false', () => {
    expect(() =>
      validateWireRequest(
        'https://solar.googleapis.com/v1/buildingInsights:findClosest?location.latitude=1&location.longitude=2&exactQualityRequired=yes',
        get,
      ),
    ).toThrow('"exactQualityRequired" expects a boolean, got "yes"');
  });
});

describe('request bodies', () => {
  it('rejects a body on a method that declares none', () => {
    expect(() =>
      validateWireRequest('https://weather.googleapis.com/v1/currentConditions:lookup?location.latitude=1&location.longitude=2', {
        method: 'GET',
        body: '{}',
      }),
    ).toThrow('weather.currentConditions.lookup takes no request body');
  });

  it('rejects a missing body on a method that requires one', () => {
    expect(() => validateWireRequest('https://places.googleapis.com/v1/places:searchText', { method: 'POST' })).toThrow(
      'places.places.searchText requires a JSON request body',
    );
  });

  it('rejects a wrong scalar type inside the body', async () => {
    const { client } = stubClient();
    const error = await rejection<ContractError>(
      searchNearby(client, {
        locationRestriction: { circle: { center: { latitude: 1, longitude: 2 }, radius: '500' as never } },
        fieldMask: ['id'],
      }),
    );
    expect(error.message).toMatch(/\/locationRestriction\/circle\/radius must be number/);
  });

  it('keeps a map field open when Discovery declares additionalProperties', () => {
    const withMap = synthetic({
      methods: { a: { id: 'synthetic.a', httpMethod: 'POST', path: 'v1/thing', request: { $ref: 'Thing' } } },
      schemas: {
        Thing: {
          type: 'object',
          properties: { labels: { type: 'object', additionalProperties: { type: 'string' } } },
        },
      },
    });
    const url = 'https://synthetic.googleapis.com/v1/thing';
    expect(() => validateWireRequest(url, post({ labels: { env: 'prod' } }), withMap)).not.toThrow();
    expect(() => validateWireRequest(url, post({ labels: { env: 1 } }), withMap)).toThrow(/labels\/env must be string/);
    expect(() => validateWireRequest(url, post({ other: 1 }), withMap)).toThrow(/additional properties \(other\)/);
  });

  it('refuses to compile a request schema that is not defined', () => {
    expect(() =>
      synthetic({
        methods: { a: { id: 'synthetic.a', httpMethod: 'POST', path: 'v1/thing', request: { $ref: 'Missing' } } },
      }),
    ).toThrow('synthetic.a requests schema "Missing", which synthetic does not define');
  });
});

describe('schema conversion', () => {
  it('closes objects by default and follows bare references', () => {
    expect(toJsonSchema({ type: 'object', properties: { a: { $ref: 'B' } } })).toEqual({
      type: 'object',
      properties: { a: { $ref: '#/definitions/B' } },
      additionalProperties: false,
    });
  });

  it('drops formats, since int64 arrives as a string and ajv knows none of the Google formats', () => {
    expect(toJsonSchema({ type: 'string', format: 'int64' })).toEqual({ type: 'string' });
    expect(toJsonSchema({ type: 'integer', format: 'int32' })).toEqual({ type: 'integer' });
  });

  it('maps arrays, enums and the any type', () => {
    expect(toJsonSchema({ type: 'array', items: { type: 'string', enum: ['A'] } })).toEqual({
      type: 'array',
      items: { type: 'string', enum: ['A'] },
    });
    expect(toJsonSchema({ type: 'any' })).toEqual({});
  });
});

describe('variant matrix', () => {
  it('accepts every Area Insights location filter arm', async () => {
    const { client } = stubClient();
    const typeFilter = { includedTypes: ['cafe'] };
    const arms: LocationFilter[] = [
      { circle: { latLng: { latitude: 1, longitude: 2 }, radius: 500 } },
      { circle: { place: 'places/abc', radius: 500 } },
      { region: { place: 'places/abc' } },
      { customArea: { polygon: { coordinates: [{ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 3 }, { latitude: 2, longitude: 3 }] } } },
    ];
    for (const locationFilter of arms) {
      await expect(computeInsights(client, { insights: ['INSIGHT_COUNT'], filter: { locationFilter, typeFilter } })).resolves.toBeDefined();
    }
  });

  it('accepts every weather lookup with paging', async () => {
    const { client } = stubClient();
    const location = { latitude: 1, longitude: 2 };
    await expect(forecastDays(client, { location, days: 3, pageSize: 2, pageToken: 't', unitsSystem: 'METRIC' })).resolves.toBeDefined();
    await expect(forecastHours(client, { location, hours: 6 })).resolves.toBeDefined();
    await expect(historyHours(client, { location, hours: 6, languageCode: 'fr' })).resolves.toBeDefined();
  });

  it('accepts the Solar data layers request with its own parameters', async () => {
    const { client } = stubClient();
    await expect(
      getDataLayers(client, { location: { latitude: 1, longitude: 2 }, radiusMeters: 50, view: 'FULL_LAYERS', requiredQuality: 'HIGH' }),
    ).resolves.toBeDefined();
  });
});
