import type { MapsClient } from '../core/client.js';
import type { Open } from '../core/types.js';

const SERVICE = 'addressvalidation';

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

export type LanguageOptions = { returnEnglishLatinAddress?: boolean };

export type ValidateAddressRequest = {
  address: PostalAddress;
  /** Ties a correction round trip to the previous response for session billing. */
  previousResponseId?: string;
  sessionToken?: string;
  enableUspsCass?: boolean;
  languageOptions?: LanguageOptions;
};

export type Verdict = {
  inputGranularity?: string;
  validationGranularity?: string;
  geocodeGranularity?: string;
  addressComplete?: boolean;
  hasUnconfirmedComponents?: boolean;
  hasInferredComponents?: boolean;
  hasReplacedComponents?: boolean;
};

export type ValidationResult = {
  verdict?: Verdict;
  address?: { formattedAddress?: string; postalAddress?: PostalAddress; [key: string]: unknown };
  geocode?: { location?: { latitude?: number; longitude?: number }; placeId?: string; [key: string]: unknown };
  metadata?: Record<string, unknown>;
  uspsData?: Record<string, unknown>;
  [key: string]: unknown;
};

export type ValidateAddressResponse = { result?: ValidationResult; responseId?: string };

export type ValidationConclusion = Open<
  'VALIDATION_CONCLUSION_UNSPECIFIED' | 'VALIDATED_VERSION_USED' | 'USER_VERSION_USED' | 'UNVALIDATED_VERSION_USED' | 'UNUSED'
>;

export type ProvideValidationFeedbackRequest = {
  conclusion: ValidationConclusion;
  responseId: string;
};

export function validateAddress(
  client: MapsClient,
  request: ValidateAddressRequest,
  options: { signal?: AbortSignal } = {},
): Promise<ValidateAddressResponse> {
  return client.request<ValidateAddressResponse>({
    service: SERVICE,
    path: '/v1:validateAddress',
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}

/** Closes the billing session opened by validateAddress. Returns an empty object. */
export function provideValidationFeedback(
  client: MapsClient,
  request: ProvideValidationFeedbackRequest,
  options: { signal?: AbortSignal } = {},
): Promise<Record<string, never>> {
  return client.request<Record<string, never>>({
    service: SERVICE,
    path: '/v1:provideValidationFeedback',
    method: 'POST',
    body: request,
    ...(options.signal ? { signal: options.signal } : {}),
  });
}
