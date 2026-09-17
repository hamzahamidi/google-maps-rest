export const MAPS_ERROR_STATUSES = [
  'CANCELLED',
  'INVALID_ARGUMENT',
  'DEADLINE_EXCEEDED',
  'NOT_FOUND',
  'ALREADY_EXISTS',
  'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED',
  'FAILED_PRECONDITION',
  'ABORTED',
  'OUT_OF_RANGE',
  'UNIMPLEMENTED',
  'INTERNAL',
  'UNAVAILABLE',
  'DATA_LOSS',
  'UNAUTHENTICATED',
  'UNKNOWN',
] as const;

export type MapsErrorStatus = (typeof MAPS_ERROR_STATUSES)[number];

export class MapsError extends Error {
  readonly httpStatus: number;
  readonly status: MapsErrorStatus;
  /** Exactly what Google sent, kept because a status outside the known set becomes UNKNOWN. */
  readonly googleStatus: string | undefined;
  readonly details: unknown;

  constructor(
    message: string,
    httpStatus: number,
    status: MapsErrorStatus,
    details?: unknown,
    googleStatus?: string,
  ) {
    super(message);
    this.name = 'MapsError';
    this.httpStatus = httpStatus;
    this.status = status;
    this.googleStatus = googleStatus ?? (status === 'UNKNOWN' ? undefined : status);
    this.details = details;
  }

  /** RESOURCE_EXHAUSTED covers both short throttling and a hard daily quota; only one is worth a retry. */
  get potentiallyRetryable(): boolean {
    return (
      this.status === 'RESOURCE_EXHAUSTED' ||
      this.status === 'UNAVAILABLE' ||
      this.status === 'INTERNAL' ||
      this.status === 'DEADLINE_EXCEEDED' ||
      this.status === 'ABORTED'
    );
  }
}

export class MapsAuthError extends MapsError {
  constructor(message: string, httpStatus: number, status: MapsErrorStatus, details?: unknown, googleStatus?: string) {
    super(message, httpStatus, status, details, googleStatus);
    this.name = 'MapsAuthError';
  }
}

export class MapsQuotaError extends MapsError {
  constructor(message: string, httpStatus: number, details?: unknown, googleStatus?: string) {
    super(message, httpStatus, 'RESOURCE_EXHAUSTED', details, googleStatus);
    this.name = 'MapsQuotaError';
  }
}

export class MapsInvalidRequestError extends MapsError {
  constructor(message: string, httpStatus: number, details?: unknown, googleStatus?: string) {
    super(message, httpStatus, 'INVALID_ARGUMENT', details, googleStatus);
    this.name = 'MapsInvalidRequestError';
  }
}

const HTTP_TO_STATUS: Record<number, MapsErrorStatus> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
};

type GoogleErrorBody = { error?: { message?: string; status?: string; details?: unknown } };

const KNOWN = new Set<string>(MAPS_ERROR_STATUSES);

function narrow(raw: string | undefined, httpStatus: number): MapsErrorStatus {
  if (raw && KNOWN.has(raw)) return raw as MapsErrorStatus;
  return HTTP_TO_STATUS[httpStatus] ?? 'UNKNOWN';
}

export function errorFromResponse(httpStatus: number, body: unknown): MapsError {
  const error = (body as GoogleErrorBody | undefined)?.error;
  const message = error?.message ?? `Request failed with HTTP ${httpStatus}`;
  const raw = error?.status;
  const status = narrow(raw, httpStatus);
  const details = error?.details;

  if (status === 'RESOURCE_EXHAUSTED') return new MapsQuotaError(message, httpStatus, details, raw);
  if (status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
    return new MapsAuthError(message, httpStatus, status, details, raw);
  }
  if (status === 'INVALID_ARGUMENT') return new MapsInvalidRequestError(message, httpStatus, details, raw);
  return new MapsError(message, httpStatus, status, details, raw);
}
