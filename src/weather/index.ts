import type { MapsClient } from '../core/client.js';
import type { LatLng, Open } from '../core/types.js';

const SERVICE = 'weather';

export type UnitsSystem = Open<'METRIC' | 'IMPERIAL'>;

export type Temperature = { degrees?: number; unit?: string };

export type WeatherCondition = {
  iconBaseUri?: string;
  description?: { text?: string; languageCode?: string };
  type?: string;
};

export type CurrentConditions = {
  currentTime?: string;
  timeZone?: { id?: string };
  isDaytime?: boolean;
  weatherCondition?: WeatherCondition;
  temperature?: Temperature;
  feelsLikeTemperature?: Temperature;
  relativeHumidity?: number;
  uvIndex?: number;
  precipitation?: unknown;
  wind?: unknown;
  [key: string]: unknown;
};

type LookupBase = {
  location: LatLng;
  languageCode?: string;
  unitsSystem?: UnitsSystem;
};

export type CurrentConditionsRequest = LookupBase;

export type ForecastDaysRequest = LookupBase & { days?: number; pageSize?: number; pageToken?: string };

export type ForecastHoursRequest = LookupBase & { hours?: number; pageSize?: number; pageToken?: string };

export type HistoryHoursRequest = LookupBase & { hours?: number; pageSize?: number; pageToken?: string };

export type ForecastDaysResponse = {
  forecastDays?: unknown[];
  timeZone?: { id?: string };
  nextPageToken?: string;
};

export type ForecastHoursResponse = {
  forecastHours?: unknown[];
  timeZone?: { id?: string };
  nextPageToken?: string;
};

export type HistoryHoursResponse = {
  historyHours?: unknown[];
  timeZone?: { id?: string };
  nextPageToken?: string;
};

function lookup<T>(
  client: MapsClient,
  path: string,
  query: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  return client.request<T>({
    service: SERVICE,
    path,
    method: 'GET',
    query: query as never,
    ...(signal ? { signal } : {}),
  });
}

export function currentConditions(
  client: MapsClient,
  request: CurrentConditionsRequest,
  options: { signal?: AbortSignal } = {},
): Promise<CurrentConditions> {
  return lookup(client, '/v1/currentConditions:lookup', request, options.signal);
}

export function forecastDays(
  client: MapsClient,
  request: ForecastDaysRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ForecastDaysResponse> {
  return lookup(client, '/v1/forecast/days:lookup', request, options.signal);
}

export function forecastHours(
  client: MapsClient,
  request: ForecastHoursRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ForecastHoursResponse> {
  return lookup(client, '/v1/forecast/hours:lookup', request, options.signal);
}

export function historyHours(
  client: MapsClient,
  request: HistoryHoursRequest,
  options: { signal?: AbortSignal } = {},
): Promise<HistoryHoursResponse> {
  return lookup(client, '/v1/history/hours:lookup', request, options.signal);
}
