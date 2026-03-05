/**
 * Rate limiter utility for API requests
 * Implements token bucket algorithm with configurable limits
 */

interface RateLimitConfig {
  maxRequests: number;      // Maximum requests per window
  windowMs: number;         // Time window in milliseconds
  minDelayMs: number;       // Minimum delay between requests
}

interface RequestRecord {
  timestamps: number[];
  lastRequest: number;
}

// Configuration per API
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  espn: {
    maxRequests: 30,        // ESPN is more generous
    windowMs: 60_000,       // 1 minute
    minDelayMs: 200,        // 200ms between requests
  },
  sportsdb: {
    maxRequests: 10,        // SportsDB free tier is strict
    windowMs: 60_000,       // 1 minute
    minDelayMs: 1000,       // 1 second between requests to be safe
  },
};

// Track requests per API
const requestTracking: Record<string, RequestRecord> = {};

/**
 * Initialize tracking for an API if not exists
 */
function initTracking(apiName: string): RequestRecord {
  if (!requestTracking[apiName]) {
    requestTracking[apiName] = {
      timestamps: [],
      lastRequest: 0,
    };
  }
  return requestTracking[apiName];
}

/**
 * Clean up old timestamps outside the window
 */
function cleanupTimestamps(record: RequestRecord, windowMs: number): void {
  const now = Date.now();
  record.timestamps = record.timestamps.filter(ts => now - ts < windowMs);
}

/**
 * Check if we can make a request, and if not, how long to wait
 * @returns milliseconds to wait (0 if can proceed immediately)
 */
export function getWaitTime(apiName: string): number {
  const config = RATE_LIMITS[apiName] || RATE_LIMITS.espn;
  const record = initTracking(apiName);
  const now = Date.now();

  // Clean up old timestamps
  cleanupTimestamps(record, config.windowMs);

  // Check minimum delay since last request
  const timeSinceLastRequest = now - record.lastRequest;
  if (timeSinceLastRequest < config.minDelayMs) {
    return config.minDelayMs - timeSinceLastRequest;
  }

  // Check if we're at the rate limit
  if (record.timestamps.length >= config.maxRequests) {
    // Find when the oldest timestamp will expire
    const oldestTimestamp = Math.min(...record.timestamps);
    const waitUntilExpiry = (oldestTimestamp + config.windowMs) - now;
    return Math.max(waitUntilExpiry, config.minDelayMs);
  }

  return 0;
}

/**
 * Record that a request was made
 */
export function recordRequest(apiName: string): void {
  const record = initTracking(apiName);
  const now = Date.now();
  record.timestamps.push(now);
  record.lastRequest = now;
}

/**
 * Wait for rate limit to clear, then make a request
 */
export async function waitForRateLimit(apiName: string): Promise<void> {
  const waitTime = getWaitTime(apiName);
  if (waitTime > 0) {
    console.log(`[rate-limiter] ${apiName}: waiting ${waitTime}ms`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
}

/**
 * Execute a request with rate limiting
 */
export async function rateLimitedFetch<T>(
  apiName: string,
  fetchFn: () => Promise<T>
): Promise<T> {
  await waitForRateLimit(apiName);
  recordRequest(apiName);
  return fetchFn();
}

/**
 * Get current rate limit status for an API
 */
export function getRateLimitStatus(apiName: string): {
  requestsRemaining: number;
  windowResetMs: number;
  canRequest: boolean;
} {
  const config = RATE_LIMITS[apiName] || RATE_LIMITS.espn;
  const record = initTracking(apiName);
  const now = Date.now();

  cleanupTimestamps(record, config.windowMs);

  const requestsRemaining = Math.max(0, config.maxRequests - record.timestamps.length);
  const oldestTimestamp = record.timestamps.length > 0 
    ? Math.min(...record.timestamps) 
    : now;
  const windowResetMs = Math.max(0, (oldestTimestamp + config.windowMs) - now);

  return {
    requestsRemaining,
    windowResetMs,
    canRequest: requestsRemaining > 0 && getWaitTime(apiName) === 0,
  };
}

/**
 * Queue multiple requests with rate limiting
 */
export async function batchRequests<T>(
  apiName: string,
  requests: Array<() => Promise<T>>
): Promise<Array<T | null>> {
  const results: Array<T | null> = [];
  
  for (const request of requests) {
    try {
      const result = await rateLimitedFetch(apiName, request);
      results.push(result);
    } catch (error) {
      console.error(`[rate-limiter] ${apiName}: request failed`, error);
      results.push(null);
    }
  }
  
  return results;
}
