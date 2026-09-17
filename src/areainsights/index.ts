import type { MapsClient } from '../core/client.js';
import type { LatLng, Open } from '../core/types.js';

const SERVICE = 'areainsights';

export type Insight = Open<'INSIGHT_UNSPECIFIED' | 'INSIGHT_COUNT' | 'INSIGHT_PLACES'>;

export type OperatingStatus = Open<
  'OPERATING_STATUS_UNSPECIFIED' | 'OPERATING_STATUS_OPERATIONAL' | 'OPERATING_STATUS_PERMANENTLY_CLOSED' | 'OPERATING_STATUS_TEMPORARILY_CLOSED'
>;

export type PriceLevel = Open<
  'PRICE_LEVEL_UNSPECIFIED' | 'PRICE_LEVEL_FREE' | 'PRICE_LEVEL_INEXPENSIVE' | 'PRICE_LEVEL_MODERATE' | 'PRICE_LEVEL_EXPENSIVE' | 'PRICE_LEVEL_VERY_EXPENSIVE'
>;

/** Not the Places circle: the centre is flat here, a latLng or place oneof, with no `center` wrapper. */
export type AreaCircle = ({ latLng: LatLng; place?: never } | { place: string; latLng?: never }) & {
  radius?: number;
};

export type LocationFilter =
  | { circle: AreaCircle; region?: never; customArea?: never }
  | { region: { place: string }; circle?: never; customArea?: never }
  | { customArea: { polygon: { coordinates: LatLng[] } }; circle?: never; region?: never };

export type TypeFilter = { includedTypes?: string[]; excludedTypes?: string[]; includedPrimaryTypes?: string[]; excludedPrimaryTypes?: string[] };

export type Filter = {
  locationFilter: LocationFilter;
  typeFilter: TypeFilter;
  operatingStatus?: OperatingStatus[];
  priceLevels?: PriceLevel[];
  ratingFilter?: { minRating?: number; maxRating?: number };
};

export type ComputeInsightsRequest = {
  insights: Insight[];
  filter: Filter;
};

export type PlaceInsight = { place?: string };

/** `count` arrives as a string because it is an int64 in the wire format. */
export type ComputeInsightsResponse = { count?: string; placeInsights?: PlaceInsight[] };

export function computeInsights(
  client: MapsClient,
  request: ComputeInsightsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ComputeInsightsResponse> {
  return client.request<ComputeInsightsResponse>({
    service: SERVICE,
    path: '/v1:computeInsights',
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
