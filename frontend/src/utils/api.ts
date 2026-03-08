const DEFAULT_LOCAL_TRADING_API = 'http://localhost:3001/api/trading';

function stripTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getTradingApiBaseUrl(): string {
  const explicitTradingUrl = process.env.NEXT_PUBLIC_TRADING_API_URL;
  if (explicitTradingUrl) return stripTrailingSlashes(explicitTradingUrl);

  const legacyApiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (legacyApiUrl) {
    const normalized = stripTrailingSlashes(legacyApiUrl);
    return normalized.endsWith('/api/trading') ? normalized : `${normalized}/api/trading`;
  }

  const explicitApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (explicitApiBase) return `${stripTrailingSlashes(explicitApiBase)}/api/trading`;

  if (typeof window !== 'undefined') {
    const { hostname, origin } = window.location;
    const isLocalHost = hostname === 'localhost' || hostname === '127.0.0.1';
    return isLocalHost ? DEFAULT_LOCAL_TRADING_API : `${origin}/api/trading`;
  }

  return DEFAULT_LOCAL_TRADING_API;
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 12000
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}
