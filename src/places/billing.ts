/**
 * Per method: photos is IDs Only on Place Details and Pro on both searches, and
 * Nearby Search has no tier below Pro. See places/web-service/usage-and-billing.
 */
export type PlacesMethod = 'getPlace' | 'searchText' | 'searchNearby';

export type BillingTier =
  | 'ESSENTIALS_IDS_ONLY'
  | 'ESSENTIALS'
  | 'PRO'
  | 'ENTERPRISE'
  | 'ENTERPRISE_ATMOSPHERE';

const TIER_ORDER: BillingTier[] = [
  'ESSENTIALS_IDS_ONLY',
  'ESSENTIALS',
  'PRO',
  'ENTERPRISE',
  'ENTERPRISE_ATMOSPHERE',
];

const ENTERPRISE = [
  'currentOpeningHours',
  'currentSecondaryOpeningHours',
  'internationalPhoneNumber',
  'nationalPhoneNumber',
  'priceLevel',
  'priceRange',
  'rating',
  'regularOpeningHours',
  'regularSecondaryOpeningHours',
  'transitStation',
  'userRatingCount',
  'websiteUri',
];

const ATMOSPHERE = [
  'allowsDogs',
  'curbsidePickup',
  'delivery',
  'dineIn',
  'editorialSummary',
  'evChargeAmenitySummary',
  'evChargeOptions',
  'fuelOptions',
  'generativeSummary',
  'goodForChildren',
  'goodForGroups',
  'goodForWatchingSports',
  'liveMusic',
  'menuForChildren',
  'neighborhoodSummary',
  'outdoorSeating',
  'parkingOptions',
  'paymentOptions',
  'reservable',
  'restroom',
  'reviewSummary',
  'reviews',
  'routingSummaries',
  'servesBeer',
  'servesBreakfast',
  'servesBrunch',
  'servesCocktails',
  'servesCoffee',
  'servesDessert',
  'servesDinner',
  'servesLunch',
  'servesVegetarianFood',
  'servesWine',
  'takeout',
];

const DETAILS_IDS_ONLY = ['attributions', 'consumerAlert', 'id', 'movedPlace', 'movedPlaceId', 'name', 'photos'];

const DETAILS_ESSENTIALS = [
  'addressComponents',
  'addressDescriptor',
  'adrFormatAddress',
  'formattedAddress',
  'location',
  'plusCode',
  'postalAddress',
  'shortFormattedAddress',
  'types',
  'viewport',
];

const DETAILS_PRO = [
  'accessibilityOptions',
  'businessStatus',
  'containingPlaces',
  'displayName',
  'googleMapsLinks',
  'googleMapsTypeLabel',
  'googleMapsUri',
  'iconBackgroundColor',
  'iconMaskBaseUri',
  'openingDate',
  'primaryType',
  'primaryTypeDisplayName',
  'pureServiceAreaBusiness',
  'subDestinations',
  'timeZone',
  'utcOffsetMinutes',
];

const SEARCH_PRO = [
  ...DETAILS_ESSENTIALS,
  ...DETAILS_PRO,
  'photos',
  'searchUri',
];

const TABLES: Record<PlacesMethod, Partial<Record<BillingTier, readonly string[]>>> = {
  getPlace: {
    ESSENTIALS_IDS_ONLY: DETAILS_IDS_ONLY,
    ESSENTIALS: DETAILS_ESSENTIALS,
    PRO: DETAILS_PRO,
    ENTERPRISE,
    ENTERPRISE_ATMOSPHERE: ATMOSPHERE,
  },
  searchText: {
    ESSENTIALS_IDS_ONLY: ['attributions', 'id', 'consumerAlert', 'name', 'nextPageToken', 'movedPlace', 'movedPlaceId'],
    PRO: SEARCH_PRO,
    ENTERPRISE,
    ENTERPRISE_ATMOSPHERE: ATMOSPHERE,
  },
  searchNearby: {
    PRO: [...SEARCH_PRO, 'attributions', 'consumerAlert', 'id', 'name', 'movedPlace', 'movedPlaceId'],
    ENTERPRISE,
    ENTERPRISE_ATMOSPHERE: ATMOSPHERE,
  },
};

export type PlaceField =
  | (typeof DETAILS_IDS_ONLY)[number]
  | (typeof DETAILS_ESSENTIALS)[number]
  | (typeof DETAILS_PRO)[number]
  | (typeof ENTERPRISE)[number]
  | (typeof ATMOSPHERE)[number]
  | 'searchUri'
  | 'nextPageToken';

export type BillingEstimate = {
  /** The highest tier recognised in the mask. A lower bound when `unclassified` is non-empty. */
  tier: BillingTier | null;
  /** Fields absent from the published table. Their SKU is unknown, so they may cost more than `tier`. */
  unclassified: string[];
};

function bare(field: string): string {
  return field.startsWith('places.') ? field.slice('places.'.length) : field;
}

/** The highest tier present is billed for the whole call; a wildcard bills at the top. */
export function billingTierFor(
  method: PlacesMethod,
  fieldMask: readonly (string & {})[] | readonly string[],
): BillingEstimate {
  const table = TABLES[method];
  const tiers = TIER_ORDER.filter((tier) => table[tier]);

  if (fieldMask.some((field) => bare(field) === '*')) {
    return { tier: tiers[tiers.length - 1] ?? null, unclassified: [] };
  }

  let highest = -1;
  const unclassified: string[] = [];

  for (const entry of fieldMask) {
    const field = bare(entry);
    const index = tiers.findIndex((tier) => table[tier]!.includes(field));
    if (index === -1) unclassified.push(field);
    else if (index > highest) highest = index;
  }

  return { tier: highest === -1 ? null : tiers[highest]!, unclassified };
}
