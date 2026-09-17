import { queryOf, type MapsClient } from '../core/client.js';
import type { LatLng, Open } from '../core/types.js';

const SERVICE = 'solar';

export type ImageryQuality = Open<'IMAGERY_QUALITY_UNSPECIFIED' | 'HIGH' | 'MEDIUM' | 'LOW' | 'BASE'>;

export type DataLayerView = Open<
  'DATA_LAYER_VIEW_UNSPECIFIED' | 'DSM_LAYER' | 'IMAGERY_LAYERS' | 'IMAGERY_AND_ANNUAL_FLUX_LAYERS' | 'IMAGERY_AND_ALL_FLUX_LAYERS' | 'FULL_LAYERS'
>;

export type FindClosestBuildingInsightsRequest = {
  location: LatLng;
  requiredQuality?: ImageryQuality;
  exactQualityRequired?: boolean;
  additionalInsights?: boolean;
  experiments?: string[];
};

export type BuildingInsights = {
  name?: string;
  center?: LatLng;
  boundingBox?: { sw?: LatLng; ne?: LatLng };
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryQuality?: ImageryQuality;
  postalCode?: string;
  administrativeArea?: string;
  regionCode?: string;
  solarPotential?: Record<string, unknown>;
  [key: string]: unknown;
};

export type GetDataLayersRequest = {
  location: LatLng;
  radiusMeters: number;
  view?: DataLayerView;
  requiredQuality?: ImageryQuality;
  exactQualityRequired?: boolean;
  pixelSizeMeters?: number;
  experiments?: string[];
};

/** Each url is a Solar API endpoint, not a file: it needs the API key appended to serve the GeoTIFF. */
export type DataLayers = {
  imageryDate?: { year?: number; month?: number; day?: number };
  imageryProcessedDate?: { year?: number; month?: number; day?: number };
  dsmUrl?: string;
  rgbUrl?: string;
  maskUrl?: string;
  annualFluxUrl?: string;
  monthlyFluxUrl?: string;
  hourlyShadeUrls?: string[];
  imageryQuality?: ImageryQuality;
};

export function findClosestBuildingInsights(
  client: MapsClient,
  request: FindClosestBuildingInsightsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<BuildingInsights> {
  return client.request<BuildingInsights>({
    service: SERVICE,
    path: '/v1/buildingInsights:findClosest',
    method: 'GET',
    query: queryOf(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

export function getDataLayers(
  client: MapsClient,
  request: GetDataLayersRequest,
  options: { signal?: AbortSignal } = {},
): Promise<DataLayers> {
  return client.request<DataLayers>({
    service: SERVICE,
    path: '/v1/dataLayers:get',
    method: 'GET',
    query: queryOf(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
