import { queryOf, type MapsClient } from '../core/client.js';
import type { LatLng } from '../core/types.js';

const SERVICE = 'pollen';

export type ForecastRequest = {
  location: LatLng;
  /** 1 to 5. */
  days: number;
  languageCode?: string;
  /** Adds the plant description fields to each entry. */
  plantsDescription?: boolean;
  pageSize?: number;
  pageToken?: string;
};

export type IndexInfo = {
  code?: string;
  displayName?: string;
  category?: string;
  indexDescription?: string;
  value?: number;
  color?: { red?: number; green?: number; blue?: number };
};

export type PollenTypeInfo = {
  code?: string;
  displayName?: string;
  inSeason?: boolean;
  indexInfo?: IndexInfo;
  healthRecommendations?: string[];
};

export type DailyInfo = {
  date?: { year?: number; month?: number; day?: number };
  pollenTypeInfo?: PollenTypeInfo[];
  plantInfo?: unknown[];
};

export type ForecastResponse = {
  regionCode?: string;
  dailyInfo?: DailyInfo[];
  nextPageToken?: string;
};

export function forecast(
  client: MapsClient,
  request: ForecastRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ForecastResponse> {
  return client.request<ForecastResponse>({
    service: SERVICE,
    path: '/v1/forecast:lookup',
    method: 'GET',
    query: queryOf(request),
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
