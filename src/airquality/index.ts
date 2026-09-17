import type { MapsClient } from '../core/client.js';
import type { LatLng, Open } from '../core/types.js';

const SERVICE = 'airquality';

export type UaqiColorPalette = Open<
  'COLOR_PALETTE_UNSPECIFIED' | 'RED_GREEN' | 'INDIGO_PERSIAN_DARK' | 'INDIGO_PERSIAN_LIGHT'
>;

export type ExtraComputation = Open<
  | 'EXTRA_COMPUTATION_UNSPECIFIED'
  | 'HEALTH_RECOMMENDATIONS'
  | 'DOMINANT_POLLUTANT_CONCENTRATION'
  | 'POLLUTANT_CONCENTRATION'
  | 'LOCAL_AQI'
  | 'POLLUTANT_ADDITIONAL_INFO'
>;

export type CustomLocalAqi = { regionCode?: string; aqi?: string };

export type Interval = { startTime?: string; endTime?: string };

type LookupBase = {
  location: LatLng;
  universalAqi?: boolean;
  customLocalAqis?: CustomLocalAqi[];
  extraComputations?: ExtraComputation[];
  uaqiColorPalette?: UaqiColorPalette;
  languageCode?: string;
};

export type CurrentConditionsRequest = LookupBase;

export type ForecastRequest = LookupBase & {
  /** Either a single dateTime or a period, not both. */
  dateTime?: string;
  period?: Interval;
  pageSize?: number;
  pageToken?: string;
};

export type HistoryRequest = LookupBase & {
  dateTime?: string;
  period?: Interval;
  hours?: number;
  pageSize?: number;
  pageToken?: string;
};

export type AirQualityIndex = {
  code?: string;
  displayName?: string;
  aqi?: number;
  aqiDisplay?: string;
  color?: { red?: number; green?: number; blue?: number };
  category?: string;
  dominantPollutant?: string;
};

export type CurrentConditionsResponse = {
  dateTime?: string;
  regionCode?: string;
  indexes?: AirQualityIndex[];
  pollutants?: unknown[];
  healthRecommendations?: Record<string, string>;
  [key: string]: unknown;
};

export type ForecastResponse = { hourlyForecasts?: unknown[]; nextPageToken?: string; regionCode?: string };

export type HistoryResponse = { hoursInfo?: unknown[]; nextPageToken?: string; regionCode?: string };

function lookup<T>(client: MapsClient, path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  return client.request<T>({
    service: SERVICE,
    path,
    method: 'POST',
    body,
    ...(signal ? { signal } : {}),
  });
}

export function currentConditions(
  client: MapsClient,
  request: CurrentConditionsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<CurrentConditionsResponse> {
  return lookup(client, '/v1/currentConditions:lookup', request, options.signal);
}

export function forecast(
  client: MapsClient,
  request: ForecastRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ForecastResponse> {
  return lookup(client, '/v1/forecast:lookup', request, options.signal);
}

export function history(
  client: MapsClient,
  request: HistoryRequest,
  options: { signal?: AbortSignal } = {},
): Promise<HistoryResponse> {
  return lookup(client, '/v1/history:lookup', request, options.signal);
}
