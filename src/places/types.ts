import type { LatLng, LocalizedText, Viewport, Circle, Rectangle } from '../core/types.js';

/**
 * Billing tier is decided by the highest-tier field present in the mask.
 * https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
 */
export const ESSENTIALS_IDS_ONLY_FIELDS = ['id', 'name', 'photos', 'attributions'] as const;

export const ESSENTIALS_FIELDS = [
  'addressComponents',
  'adrFormatAddress',
  'formattedAddress',
  'location',
  'plusCode',
  'postalAddress',
  'shortFormattedAddress',
  'types',
  'viewport',
] as const;

export const PRO_FIELDS = [
  'accessibilityOptions',
  'businessStatus',
  'displayName',
  'googleMapsUri',
  'primaryType',
  'primaryTypeDisplayName',
  'pureServiceAreaBusiness',
  'subDestinations',
  'utcOffsetMinutes',
] as const;

export const ENTERPRISE_FIELDS = [
  'currentOpeningHours',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'priceLevel',
  'priceRange',
  'rating',
  'regularOpeningHours',
  'userRatingCount',
  'websiteUri',
] as const;

export type PlaceField =
  | (typeof ESSENTIALS_IDS_ONLY_FIELDS)[number]
  | (typeof ESSENTIALS_FIELDS)[number]
  | (typeof PRO_FIELDS)[number]
  | (typeof ENTERPRISE_FIELDS)[number];

export type FieldMaskEntry = PlaceField | (string & {});

export type BillingTier = 'ESSENTIALS_IDS_ONLY' | 'ESSENTIALS' | 'PRO' | 'ENTERPRISE';

export type AddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
  languageCode?: string;
};

export type Place = {
  id?: string;
  name?: string;
  types?: string[];
  primaryType?: string;
  primaryTypeDisplayName?: LocalizedText;
  displayName?: LocalizedText;
  formattedAddress?: string;
  shortFormattedAddress?: string;
  adrFormatAddress?: string;
  addressComponents?: AddressComponent[];
  location?: LatLng;
  viewport?: Viewport;
  googleMapsUri?: string;
  businessStatus?: string;
  utcOffsetMinutes?: number;
  [key: string]: unknown;
};

export type TextMatch = { startOffset?: number; endOffset?: number };

export type PlacePrediction = {
  place?: string;
  placeId?: string;
  text?: { text?: string; matches?: TextMatch[] };
  structuredFormat?: {
    mainText?: { text?: string; matches?: TextMatch[] };
    secondaryText?: { text?: string };
  };
  types?: string[];
  distanceMeters?: number;
};

export type QueryPrediction = {
  text?: { text?: string; matches?: TextMatch[] };
  structuredFormat?: PlacePrediction['structuredFormat'];
};

export type AutocompleteSuggestion = {
  placePrediction?: PlacePrediction;
  queryPrediction?: QueryPrediction;
};

export type AutocompleteResponse = { suggestions?: AutocompleteSuggestion[] };

export type LocationBias =
  | { circle: Circle; rectangle?: never }
  | { rectangle: Rectangle; circle?: never };

export type AutocompleteRequest = {
  input: string;
  languageCode?: string;
  regionCode?: string;
  /** ISO 3166-1 alpha-2 codes. Replaces the legacy `components=country:xx` parameter. */
  includedRegionCodes?: string[];
  /** Replaces the legacy `types` parameter. */
  includedPrimaryTypes?: string[];
  locationBias?: LocationBias;
  locationRestriction?: LocationBias;
  origin?: LatLng;
  inputOffset?: number;
  includeQueryPredictions?: boolean;
  /** Ties this call to a terminating getPlace call for session billing. */
  sessionToken?: string;
};

export type GetPlaceRequest = {
  /** Bare place id; the `places/` prefix is added if absent. */
  placeId: string;
  /** Required by the API, and it decides the billed SKU. */
  fieldMask: readonly FieldMaskEntry[];
  languageCode?: string;
  regionCode?: string;
  sessionToken?: string;
};

export type SearchTextRequest = {
  textQuery: string;
  fieldMask: readonly FieldMaskEntry[];
  languageCode?: string;
  regionCode?: string;
  includedType?: string;
  openNow?: boolean;
  minRating?: number;
  maxResultCount?: number;
  priceLevels?: string[];
  rankPreference?: 'RELEVANCE' | 'DISTANCE';
  locationBias?: LocationBias;
  locationRestriction?: { rectangle: Rectangle };
};

export type SearchNearbyRequest = {
  locationRestriction: { circle: Circle };
  fieldMask: readonly FieldMaskEntry[];
  includedTypes?: string[];
  excludedTypes?: string[];
  includedPrimaryTypes?: string[];
  excludedPrimaryTypes?: string[];
  maxResultCount?: number;
  rankPreference?: 'POPULARITY' | 'DISTANCE';
  languageCode?: string;
  regionCode?: string;
};

export type SearchResponse = { places?: Place[] };
