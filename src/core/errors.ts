export type MapsErrorStatus =
  | 'INVALID_ARGUMENT'
  | 'PERMISSION_DENIED'
  | 'NOT_FOUND'
  | 'RESOURCE_EXHAUSTED'
  | 'UNAUTHENTICATED'
  | 'INTERNAL'
  | 'UNAVAILABLE'
  | 'UNKNOWN';

export class MapsError extends Error {
  readonly httpStatus: number;
  readonly status: MapsErrorStatus;
  readonly details: unknown;

  constructor(message: string, httpStatus: number, status: MapsErrorStatus, details?: unknown) {
    super(message);
    this.name = 'MapsError';
    this.httpStatus = httpStatus;
    this.status = status;
    this.details = details;
  }

  get retryable(): boolean {
    return this.status === 'RESOURCE_EXHAUSTED' || this.status === 'UNAVAILABLE' || this.status === 'INTERNAL';
  }
}

export class MapsAuthError extends MapsError {
  constructor(message: string, httpStatus: number, status: MapsErrorStatus, details?: unknown) {
    super(message, httpStatus, status, details);
    this.name = 'MapsAuthError';
  }
}

export class MapsQuotaError extends MapsError {
  constructor(message: string, httpStatus: number, details?: unknown) {
    super(message, httpStatus, 'RESOURCE_EXHAUSTED', details);
    this.name = 'MapsQuotaError';
  }
}

export class MapsInvalidRequestError extends MapsError {
  constructor(message: string, httpStatus: number, details?: unknown) {
    super(message, httpStatus, 'INVALID_ARGUMENT', details);
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

export function errorFromResponse(httpStatus: number, body: unknown): MapsError {
  const error = (body as GoogleErrorBody | undefined)?.error;
  const message = error?.message ?? `Request failed with HTTP ${httpStatus}`;
  const status = (error?.status as MapsErrorStatus | undefined) ?? HTTP_TO_STATUS[httpStatus] ?? 'UNKNOWN';
  const details = error?.details;

  if (status === 'RESOURCE_EXHAUSTED') return new MapsQuotaError(message, httpStatus, details);
  if (status === 'PERMISSION_DENIED' || status === 'UNAUTHENTICATED') {
    return new MapsAuthError(message, httpStatus, status, details);
  }
  if (status === 'INVALID_ARGUMENT') return new MapsInvalidRequestError(message, httpStatus, details);
  return new MapsError(message, httpStatus, status, details);
}
