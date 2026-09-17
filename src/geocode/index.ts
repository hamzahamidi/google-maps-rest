import { queryOf, type MapsClient } from '../core/client.js';
import type { LatLng, Open, Rectangle } from '../core/types.js';

const SERVICE = 'geocode';

export type Granularity = Open<
  'ROOFTOP' | 'RANGE_INTERPOLATED' | 'GEOMETRIC_CENTER' | 'APPROXIMATE' | 'OTHER'
>;

export type GeocodeResult = {
  place?: string;
  placeId?: string;
  location?: LatLng;
  granularity?: Granularity;
  formattedAddress?: string;
  postalAddress?: unknown;
  addressComponents?: unknown[];
  types?: string[];
  viewport?: { low?: LatLng; high?: LatLng };
  plusCode?: unknown;
  [key: string]: unknown;
};

export type GeocodeResponse = { results?: GeocodeResult[] };

export type PostalAddress = {
  regionCode: string;
  addressLines: string[];
  languageCode?: string;
  postalCode?: string;
  administrativeArea?: string;
  locality?: string;
  sublocality?: string;
  organization?: string;
  recipients?: string[];
  sortingCode?: string;
  revision?: number;
};

/** The only bias the service defines is a rectangle. There is no circle form. */
export type GeocodeLocationBias = { rectangle: Rectangle };

type GeocodeAddressCommon = {
  regionCode?: string;
  languageCode?: string;
  locationBias?: GeocodeLocationBias;
};

export type GeocodeAddressRequest = GeocodeAddressCommon &
  (
    | { addressQuery: string; address?: never }
    | { address: PostalAddress; addressQuery?: never }
  );

type GeocodeLocationCommon = {
  languageCode?: string;
  regionCode?: string;
  types?: string[];
  granularity?: Granularity[];
};

export type GeocodeLocationRequest = GeocodeLocationCommon &
  (
    | { location: LatLng; locationQuery?: never }
    /** A "lat,lng" string, for example "64.7611872,-18.4705364". */
    | { locationQuery: string; location?: never }
  );

export type GeocodePlaceRequest = {
  /** Bare place id; the `places/` prefix is added if absent. */
  placeId: string;
  languageCode?: string;
  regionCode?: string;
};

export function geocodeAddress(
  client: MapsClient,
  request: GeocodeAddressRequest,
  options: { signal?: AbortSignal } = {},
): Promise<GeocodeResponse> {
  return client.request<GeocodeResponse>({
    service: SERVICE,
    path: '/v4/geocode/address',
    method: 'GET',
    query: queryOf(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function geocodeLocation(
  client: MapsClient,
  request: GeocodeLocationRequest,
  options: { signal?: AbortSignal } = {},
): Promise<GeocodeResponse> {
  return client.request<GeocodeResponse>({
    service: SERVICE,
    path: '/v4/geocode/location',
    method: 'GET',
    query: queryOf(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function geocodePlace(
  client: MapsClient,
  request: GeocodePlaceRequest,
  options: { signal?: AbortSignal } = {},
): Promise<GeocodeResponse> {
  const { placeId, ...rest } = request;
  const id = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
  return client.request<GeocodeResponse>({
    service: SERVICE,
    path: `/v4/geocode/places/${encodeURIComponent(id)}`,
    method: 'GET',
    query: queryOf(rest),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
