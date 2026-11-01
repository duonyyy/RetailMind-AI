import { sleep } from './utils';

/**
 * Uniform API Envelope per ADR-009 & 12-API_DESIGN.md
 */
export interface ServerResponseDto<T> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } | null;
  meta: {
    request_id: string;
    timestamp: string;
    server_version?: string;
  };
}

export interface ApiFetchOptions extends RequestInit {
  retries?: number;
  retryDelayMs?: number;
  traceId?: string;
  customerId?: string;
  idempotencyKey?: string;
}

function generateTraceId(): string {
  return `tr-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;
}

/**
 * Enterprise Fetcher (ADR-009 Section 2.3)
 * - Routes client requests through `/api/proxy/...` and SSR requests to internal backend
 * - Propagates OpenTelemetry correlation headers (`x-trace-id`, `x-correlation-id`)
 * - Retries transient network errors (502, 503, 504) with exponential backoff
 */
export async function apiFetch<T>(
  endpoint: string,
  options: ApiFetchOptions = {}
): Promise<ServerResponseDto<T>> {
  const {
    retries = 2,
    retryDelayMs = 250,
    traceId = generateTraceId(),
    customerId,
    idempotencyKey,
    headers: customHeaders,
    ...fetchInit
  } = options;

  const cleanPath = endpoint.replace(/^\/+/, '');
  const isBrowser = typeof window !== 'undefined';
  const baseUrl = isBrowser
    ? '/api/proxy'
    : `${process.env.BACKEND_INTERNAL_URL || 'http://localhost:4000'}/api/v1`;

  const url = `${baseUrl}/${cleanPath}`;

  const headers = new Headers(customHeaders);
  if (!headers.has('Content-Type') && !(fetchInit.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  headers.set('Accept', 'application/json');
  headers.set('x-trace-id', traceId);
  headers.set('x-correlation-id', traceId);

  if (customerId) {
    headers.set('x-customer-id', customerId);
  }
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(url, {
        ...fetchInit,
        credentials: fetchInit.credentials || 'include',
        headers,
      });

      if ([502, 503, 504].includes(response.status) && attempt < retries) {
        attempt++;
        await sleep(retryDelayMs * Math.pow(2, attempt - 1));
        continue;
      }

      const raw = await response.json().catch(() => null);

      if (response.ok) {
        const unwrappedData =
          raw && typeof raw === 'object' && 'data' in raw ? (raw.data as T) : (raw as T);

        // Defensive normalization: If unwrappedData is an object without its own 'data' property,
        // provide a non-enumerable fallback .data pointing to itself so callers doing res.data?.data
        // will safely receive the payload instead of undefined!
        if (
          unwrappedData &&
          typeof unwrappedData === 'object' &&
          !Array.isArray(unwrappedData) &&
          !('data' in unwrappedData)
        ) {
          try {
            Object.defineProperty(unwrappedData, 'data', {
              value: unwrappedData,
              enumerable: false,
              writable: true,
              configurable: true,
            });
          } catch {
            // Ignore if object is non-extensible
          }
        }

        return {
          success: true,
          data: unwrappedData,
          error: null,
          meta: raw?.meta || {
            request_id: traceId,
            timestamp: new Date().toISOString(),
            server_version: 'v1.0-2026',
          },
        };
      }

      return {
        success: false,
        data: null,
        error: raw?.error || {
          code: `HTTP_${response.status}`,
          message: raw?.message || 'Yêu cầu không thể xử lý tại thời điểm này.',
        },
        meta: raw?.meta || {
          request_id: traceId,
          timestamp: new Date().toISOString(),
        },
      };
    } catch (err) {
      if (attempt < retries) {
        attempt++;
        await sleep(retryDelayMs * Math.pow(2, attempt - 1));
        continue;
      }

      return {
        success: false,
        data: null,
        error: {
          code: 'NETWORK_FALLBACK',
          message:
            err instanceof Error
              ? err.message
              : 'Dịch vụ máy chủ đang ở chế độ dự phòng ngoại tuyến (Graceful Degradation).',
        },
        meta: {
          request_id: traceId,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }
}
