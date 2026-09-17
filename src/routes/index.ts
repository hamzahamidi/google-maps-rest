import type { MapsClient } from '../core/client.js';
import type { Int64String, LatLng, Money, Open } from '../core/types.js';

const SERVICE = 'routes';

export type TravelMode = Open<'DRIVE' | 'BICYCLE' | 'WALK' | 'TWO_WHEELER' | 'TRANSIT'>;
export type RoutingPreference = Open<'TRAFFIC_UNAWARE' | 'TRAFFIC_AWARE' | 'TRAFFIC_AWARE_OPTIMAL'>;
export type Units = Open<'METRIC' | 'IMPERIAL'>;

export type Waypoint = {
  location?: { latLng: LatLng; heading?: number };
  placeId?: string;
  address?: string;
  via?: boolean;
  sideOfRoad?: boolean;
};

export type RouteModifiers = {
  avoidTolls?: boolean;
  avoidHighways?: boolean;
  avoidFerries?: boolean;
  avoidIndoor?: boolean;
};

export type ComputeRoutesRequest = {
  origin: Waypoint;
  destination: Waypoint;
  /** Required by the API. Rooted at `routes.` automatically. */
  fieldMask: readonly string[];
  intermediates?: Waypoint[];
  travelMode?: TravelMode;
  routingPreference?: RoutingPreference;
  routeModifiers?: RouteModifiers;
  departureTime?: string;
  arrivalTime?: string;
  computeAlternativeRoutes?: boolean;
  languageCode?: string;
  regionCode?: string;
  units?: Units;
};

export type Route = {
  distanceMeters?: number;
  duration?: string;
  staticDuration?: string;
  polyline?: { encodedPolyline?: string };
  description?: string;
  legs?: unknown[];
  travelAdvisory?: RouteTravelAdvisory;
  [key: string]: unknown;
};

export type RouteTravelAdvisory = {
  fuelConsumptionMicroliters?: Int64String;
  transitFare?: Money;
  tollInfo?: { estimatedPrice?: Money[] };
  [key: string]: unknown;
};

export type ComputeRoutesResponse = { routes?: Route[] };

export type ComputeRouteMatrixRequest = {
  origins: { waypoint: Waypoint; routeModifiers?: RouteModifiers }[];
  destinations: { waypoint: Waypoint }[];
  fieldMask: readonly string[];
  travelMode?: TravelMode;
  routingPreference?: RoutingPreference;
  departureTime?: string;
  languageCode?: string;
  regionCode?: string;
  units?: Units;
};

export type RouteMatrixCondition = Open<'ROUTE_MATRIX_ELEMENT_CONDITION_UNSPECIFIED' | 'ROUTE_EXISTS' | 'ROUTE_NOT_FOUND'>;

export type RouteMatrixElement = {
  originIndex?: number;
  destinationIndex?: number;
  distanceMeters?: number;
  duration?: string;
  condition?: RouteMatrixCondition;
  status?: { code?: number; message?: string; details?: unknown[] };
  travelAdvisory?: RouteTravelAdvisory;
  [key: string]: unknown;
};

/** Without these a failed element is indistinguishable from one with no route, and unmappable to its inputs. */
const MATRIX_REQUIRED = ['originIndex', 'destinationIndex', 'status', 'condition'] as const;

function rootedMask(fieldMask: readonly string[], root: string): string[] {
  return fieldMask.map((field) => (field.startsWith(`${root}.`) || field === '*' ? field : `${root}.${field}`));
}

export function computeRoutes(
  client: MapsClient,
  request: ComputeRoutesRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ComputeRoutesResponse> {
  const { fieldMask, ...body } = request;
  return client.request<ComputeRoutesResponse>({
    service: SERVICE,
    path: '/directions/v2:computeRoutes',
    method: 'POST',
    body,
    fieldMask: rootedMask(fieldMask, 'routes'),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/** Returns a flat element list, not a matrix. Pair originIndex with destinationIndex. */
export function computeRouteMatrix(
  client: MapsClient,
  request: ComputeRouteMatrixRequest,
  options: { signal?: AbortSignal } = {},
): Promise<RouteMatrixElement[]> {
  const { fieldMask, ...body } = request;
  const mask = [...fieldMask];
  for (const field of MATRIX_REQUIRED) if (!mask.includes(field)) mask.push(field);

  return client.request<RouteMatrixElement[]>({
    service: SERVICE,
    path: '/distanceMatrix/v2:computeRouteMatrix',
    method: 'POST',
    body,
    fieldMask: mask,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
