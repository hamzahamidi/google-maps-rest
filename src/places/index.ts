import type { MapsClient } from '../core/client.js';
import type {
  AutocompleteRequest,
  AutocompleteResponse,
  FieldMaskEntry,
  GetPlaceRequest,
  Place,
  SearchNearbyRequest,
  SearchResponse,
  SearchTextRequest,
  SearchTextResponse,
} from './types.js';

export * from './types.js';
export * from './billing.js';

const SERVICE = 'places';

/** Search responses nest results under `places`, so the mask is rooted there. Details responses are not nested. */
function searchMask(fieldMask: readonly FieldMaskEntry[]): string[] {
  return fieldMask.map((field) => (field.startsWith('places.') || field === '*' ? field : `places.${field}`));
}

export function autocomplete(
  client: MapsClient,
  request: AutocompleteRequest,
  options: { signal?: AbortSignal } = {},
): Promise<AutocompleteResponse> {
  return client.request<AutocompleteResponse>({
    service: SERVICE,
    path: '/v1/places:autocomplete',
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function getPlace(
  client: MapsClient,
  request: GetPlaceRequest,
  options: { signal?: AbortSignal } = {},
): Promise<Place> {
  const { placeId, fieldMask, ...rest } = request;
  const id = placeId.startsWith('places/') ? placeId.slice('places/'.length) : placeId;
  return client.request<Place>({
    service: SERVICE,
    path: `/v1/places/${encodeURIComponent(id)}`,
    method: 'GET',
    query: { ...rest },
    fieldMask,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function searchText(
  client: MapsClient,
  request: SearchTextRequest,
  options: { signal?: AbortSignal } = {},
): Promise<SearchTextResponse> {
  const { fieldMask, ...body } = request;
  return client.request<SearchTextResponse>({
    service: SERVICE,
    path: '/v1/places:searchText',
    method: 'POST',
    body,
    fieldMask: searchMask(fieldMask),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function searchNearby(
  client: MapsClient,
  request: SearchNearbyRequest,
  options: { signal?: AbortSignal } = {},
): Promise<SearchResponse> {
  const { fieldMask, ...body } = request;
  return client.request<SearchResponse>({
    service: SERVICE,
    path: '/v1/places:searchNearby',
    method: 'POST',
    body,
    fieldMask: searchMask(fieldMask),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
