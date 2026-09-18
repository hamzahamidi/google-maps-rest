# google-maps-rest

[![CI](https://github.com/hamzahamidi/google-maps-rest/actions/workflows/ci.yml/badge.svg)](https://github.com/hamzahamidi/google-maps-rest/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/hamzahamidi/google-maps-rest/branch/main/graph/badge.svg)](https://codecov.io/gh/hamzahamidi/google-maps-rest)
[![npm](https://img.shields.io/npm/v/google-maps-rest)](https://www.npmjs.com/package/google-maps-rest)
[![install size](https://packagephobia.com/badge?p=google-maps-rest)](https://packagephobia.com/result?p=google-maps-rest)
[![License](https://img.shields.io/npm/l/google-maps-rest)](LICENSE)

Google's new Maps APIs each ship their own npm package, and every one is generated on `google-gax`. gRPC is the default transport in Node, and the install carries `@grpc/grpc-js`, `protobufjs` and `google-auth-library`: 36 MB for one API.

Every one of these APIs is REST/JSON over HTTPS, and every RPC declares its own REST route in Google's public service definitions. This package calls those routes directly. 56 kB, no runtime dependencies.

```bash
npm install google-maps-rest
```

Node 18 or later, or any runtime with a global `fetch`.

| | install size | runtime deps |
|---|---|---|
| `@googlemaps/places` | 36 MB, 66 packages | `google-gax` |
| `google-maps-rest` | 56 kB unpacked, 13 kB packed | none |

Sizes are local `node_modules` after `npm install --omit=dev`, measured 2026-09-17. They are not container image deltas.

## Usage

```ts
import { createClient } from 'google-maps-rest';
import { searchText, getPlace, billingTierFor } from 'google-maps-rest/places';

const client = createClient({ apiKey: process.env.GOOGLE_MAPS_API_KEY! });

const { places = [] } = await searchText(client, {
  textQuery: 'coffee in Paris',
  fieldMask: ['id', 'displayName', 'location'],
});

for (const match of places) {
  console.log(match.displayName?.text, match.location);
}

const [first] = places;
if (first?.id) {
  const place = await getPlace(client, {
    placeId: first.id,
    fieldMask: ['displayName', 'formattedAddress', 'rating'],
  });
  console.log(place.rating, billingTierFor('getPlace', ['displayName', 'rating']));
}
```

Each API is a subpath import, so you only bundle what you call.

```ts
import { computeRoutes } from 'google-maps-rest/routes';
import { geocodeAddress } from 'google-maps-rest/geocode';
import { currentConditions } from 'google-maps-rest/weather';
```

## Field masks

Places and Routes require `X-Goog-FieldMask`, and the mask decides the billed SKU. Pass bare field names. The client roots them where the response nests results:

| call | you pass | sent as |
|---|---|---|
| `searchText`, `searchNearby` | `['id']` | `places.id` |
| `getPlace` | `['id']` | `id` |
| `computeRoutes` | `['duration']` | `routes.duration` |
| `computeRouteMatrix` | `['duration']` | `duration` |

`billingTierFor(method, mask)` returns the tier that mask bills at, since the highest tier present applies to the whole call. The method is required because the same field is priced differently per call: `photos` is IDs Only on `getPlace` and Pro on `searchText`, and Nearby Search has no tier below Pro at all.

```ts
billingTierFor('getPlace', ['id', 'photos']);
// { tier: 'ESSENTIALS_IDS_ONLY', unclassified: [] }

billingTierFor('searchText', ['id', 'photos']);
// { tier: 'PRO', unclassified: [] }
```

A field Google has added since these tables were written comes back in `unclassified` rather than being priced as the cheapest tier, so `tier` is a lower bound whenever that array is not empty.

## Coverage

| API | host | calls |
|---|---|---|
| Places (New) | `places.googleapis.com` | `autocomplete`, `getPlace`, `searchText`, `searchNearby` |
| Routes | `routes.googleapis.com` | `computeRoutes`, `computeRouteMatrix` |
| Geocoding v4 | `geocode.googleapis.com` | `geocodeAddress`, `geocodeLocation`, `geocodePlace` |
| Weather | `weather.googleapis.com` | `currentConditions`, `forecastDays`, `forecastHours`, `historyHours` |
| Address Validation | `addressvalidation.googleapis.com` | `validateAddress`, `provideValidationFeedback` |
| Air Quality | `airquality.googleapis.com` | `currentConditions`, `forecast`, `history` |
| Pollen | `pollen.googleapis.com` | `forecast` |
| Solar | `solar.googleapis.com` | `findClosestBuildingInsights`, `getDataLayers` |
| Area Insights | `areainsights.googleapis.com` | `computeInsights` |

This package does not cover the legacy APIs. Elevation, Time Zone, Geolocation and the legacy Places, Directions and Distance Matrix endpoints use `?key=` query auth against `maps.googleapis.com`. Use [`@googlemaps/google-maps-services-js`](https://github.com/googlemaps/google-maps-services-js) for those.

## Auth

The API key goes in an `X-Goog-Api-Key` header on every call, never in the query string. Some Google docs show `?key=` instead, but the two are the query and header forms of the same [system parameter](https://cloud.google.com/apis/docs/system-parameters), available across Google REST APIs.

## Errors

Failed calls throw `MapsError` or one of `MapsAuthError`, `MapsQuotaError`, `MapsInvalidRequestError`. Each carries `httpStatus`, a `status` narrowed to the canonical gRPC codes, the raw `googleStatus` Google sent, the original `message` and any `details`.

`error.potentiallyRetryable` is true for `RESOURCE_EXHAUSTED`, `UNAVAILABLE`, `INTERNAL`, `DEADLINE_EXCEEDED` and `ABORTED`. It means another attempt is worth making, not that one will succeed: `RESOURCE_EXHAUSTED` covers both short throttling and a hard daily quota, and retrying the second only burns the rest of your budget.

```ts
import { MapsQuotaError } from 'google-maps-rest';

try {
  await searchText(client, { textQuery: 'pizza', fieldMask: ['id'] });
} catch (error) {
  if (error instanceof MapsQuotaError) {
    // error.potentiallyRetryable === true
  }
}
```

## Contract tests

Every unit test sends its request through a stub `fetch` that checks the final URL, query string and JSON body against the Google Discovery document pinned under `test/discovery/`. Unknown body fields, undefined enum values, undeclared query parameters and wrong scalar types fail the test. The check covers requests only: responses, `oneof` exclusivity and semantic limits are outside it.

Seven documents are pinned. Routes and Geocoding v4 refuse anonymous Discovery requests, so their tests run without the check until someone fetches those two documents once with a key:

```bash
GOOGLE_MAPS_API_KEY=... npm run discovery:fetch -- routes geocode
```

The key travels in a header and is not recorded. A weekly workflow refetches the pinned documents and opens an issue when a method, parameter, request field or enum changes.

## Status

Version 0.1.0. The API surface may change before 1.0. Nothing here has run against a production workload yet.

## License

MIT
