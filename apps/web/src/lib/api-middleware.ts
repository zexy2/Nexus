/**
 * API Middleware - Authentication and Rate Limiting
 * 
 * Provides reusable middleware functions for:
 * - Session-based authentication
 * - IP-based rate limiting
 * - Request logging/tracing
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "./auth";
import { headers } from "next/headers";

// ===========================================
// TYPES
// ===========================================

export interface AuthenticatedRequest extends NextRequest {
  user?: {
    id: string;
    email: string;
    name?: string;
  };
  session?: {
    id: string;
    expiresAt: Date;
  };
}

interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix?: string;    // Optional prefix for the key
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ===========================================
// RATE LIMITER (In-Memory)
// ===========================================

// In-memory store for rate limiting
// For production: use Redis or similar
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

// Cleanup old entries periodically
const CLEANUP_INTERVAL = 60 * 1000; // 1 minute
let lastCleanup = Date.now();

function cleanupRateLimitStore() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  
  lastCleanup = now;
  for (const [key, data] of rateLimitStore.entries()) {
    if (data.resetAt < now) {
      rateLimitStore.delete(key);
    }
  }
}

/**
 * Check rate limit for a given key
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  cleanupRateLimitStore();
  
  const now = Date.now();
  const fullKey = config.keyPrefix ? `${config.keyPrefix}:${key}` : key;
  const existing = rateLimitStore.get(fullKey);
  
  // If no existing record or window expired, create new
  if (!existing || existing.resetAt < now) {
    const resetAt = now + config.windowMs;
    rateLimitStore.set(fullKey, { count: 1, resetAt });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
    };
  }
  
  // Increment counter
  existing.count++;
  
  if (existing.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }
  
  return {
    allowed: true,
    remaining: config.maxRequests - existing.count,
    resetAt: existing.resetAt,
  };
}

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  // Check forwarded headers first (for proxies/load balancers)
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const firstIp = forwarded.split(",")[0];
    return firstIp?.trim() || "unknown";
  }
  
  const realIp = request.headers.get("x-real-ip");
  if (realIp) {
    return realIp.trim();
  }
  
  // Fallback to unknown (localhost in development)
  return "127.0.0.1";
}

// ===========================================
// AUTHENTICATION
// ===========================================

/**
 * Verify session and return user info
 */
export async function verifySession(): Promise<{
  user: { id: string; email: string; name: string };
  session: { id: string; expiresAt: Date };
} | null> {
  try {
    const result = await auth.api.getSession({ headers: await headers() });
    
    if (!result?.user || !result?.session) {
      return null;
    }
    
    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        name: result.user.name || "",
      },
      session: {
        id: result.session.id,
        expiresAt: new Date(result.session.expiresAt),
      },
    };
  } catch (error) {
    console.error("[Auth] Session verification failed:", error);
    return null;
  }
}

/**
 * Require authentication - returns error response if not authenticated
 */
export async function requireAuth(): Promise<
  | { authenticated: true; user: { id: string; email: string; name: string }; session: { id: string; expiresAt: Date } }
  | { authenticated: false; response: NextResponse }
> {
  const session = await verifySession();
  
  if (!session) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: "Unauthorized", message: "Authentication required" },
        { status: 401 }
      ),
    };
  }
  
  return {
    authenticated: true,
    user: session.user,
    session: session.session,
  };
}

// ===========================================
// RATE LIMIT MIDDLEWARE
// ===========================================

// Default rate limit configs
export const RATE_LIMITS = {
  // Research API - 10 requests per minute (paid external API)
  research: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: "research",
  },
  // Sync endpoints - 60 requests per minute
  sync: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyPrefix: "sync",
  },
  // Embeddings - 20 requests per minute (OpenAI costs)
  embeddings: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: "embeddings",
  },
  // Approvals - 30 requests per minute
  approvals: {
    windowMs: 60 * 1000,
    maxRequests: 30,
    keyPrefix: "approvals",
  },
  // Default - 100 requests per minute
  default: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyPrefix: "default",
  },
} as const;

/**
 * Apply rate limiting to a request
 * Returns error response if limit exceeded
 */
export function applyRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): { allowed: true } | { allowed: false; response: NextResponse } {
  const clientIP = getClientIP(request);
  const result = checkRateLimit(clientIP, config);
  
  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          message: `Rate limit exceeded. Try again after ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(config.maxRequests),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(result.resetAt),
          },
        }
      ),
    };
  }
  
  return { allowed: true };
}

// ===========================================
// COMBINED MIDDLEWARE HELPERS
// ===========================================

/**
 * Protect an API route with both auth and rate limiting
 */
export async function protectRoute(
  request: NextRequest,
  options: {
    requireAuth?: boolean;
    rateLimit?: RateLimitConfig;
  } = {}
): Promise<
  | { success: true; user?: { id: string; email: string; name: string }; session?: { id: string; expiresAt: Date } }
  | { success: false; response: NextResponse }
> {
  const { requireAuth: authRequired = true, rateLimit } = options;
  
  // Check rate limit first (cheaper operation)
  if (rateLimit) {
    const rateLimitResult = applyRateLimit(request, rateLimit);
    if (!rateLimitResult.allowed) {
      return { success: false, response: rateLimitResult.response };
    }
  }
  
  // Check authentication
  if (authRequired) {
    const authResult = await requireAuth();
    if (!authResult.authenticated) {
      return { success: false, response: authResult.response };
    }
    return {
      success: true,
      user: authResult.user,
      session: authResult.session,
    };
  }
  
  return { success: true };
}
