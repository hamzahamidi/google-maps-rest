# google-maps-rest

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

const { places } = await searchText(client, {
  textQuery: 'coffee in Paris',
  fieldMask: ['id', 'displayName', 'location'],
});

const place = await getPlace(client, {
  placeId: places![0]!.id!,
  fieldMask: ['displayName', 'formattedAddress', 'rating'],
});
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

`billingTierFor(mask)` returns the tier that mask bills at, since the highest tier present applies to the whole call.

## Coverage

| API | host | calls |
|---|---|---|
| Places (New) | `places.googleapis.com` | `autocomplete`, `getPlace`, `searchText`, `searchNearby` |
| Routes | `routes.googleapis.com` | `computeRoutes`, `computeRouteMatrix` |
| Geocoding v4 | `geocode.googleapis.com` | `geocodeAddress`, `geocodeLocation`, `geocodePlace` |
| Weather | `weather.googleapis.com` | `currentConditions`, `forecastDays`, `forecastHours`, `historyHours` |

Not yet implemented: Address Validation, Air Quality, Pollen, Solar, Area Insights. They share the same transport and auth, so each is a types file and a handful of functions.

This package does not cover the legacy APIs. Elevation, Time Zone, Geolocation and the legacy Places, Directions and Distance Matrix endpoints use `?key=` query auth against `maps.googleapis.com`. Use [`@googlemaps/google-maps-services-js`](https://github.com/googlemaps/google-maps-services-js) for those.

## Auth

The API key goes in an `X-Goog-Api-Key` header on every call, never in the query string. Some Google docs show `?key=`, but the header is accepted on all of these hosts.

## Errors

Failed calls throw `MapsError` or one of `MapsAuthError`, `MapsQuotaError`, `MapsInvalidRequestError`. Each carries `httpStatus`, Google's `status` string, the original `message` and any `details`. `error.retryable` is true for `RESOURCE_EXHAUSTED`, `UNAVAILABLE` and `INTERNAL`.

```ts
import { MapsQuotaError } from 'google-maps-rest';

try {
  await searchText(client, { textQuery: 'pizza', fieldMask: ['id'] });
} catch (error) {
  if (error instanceof MapsQuotaError) {
    // error.retryable === true
  }
}
```

## Status

Version 0.1.0. The API surface may change before 1.0. Nothing here has run against a production workload yet.

## License

MIT
