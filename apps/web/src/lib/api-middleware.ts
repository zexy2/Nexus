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
import { checkPersistentRateLimit } from "./production-guardrails";
import { getTrustedProxyClientIP } from "./request-ip";

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

// ===========================================
// RATE LIMITER
// ===========================================
// Rate limiting is backed by the persistent (database) limiter in
// production-guardrails.ts so limits survive restarts and apply across all
// serverless instances. See `applyRateLimit` below.

/**
 * Get client IP from request
 */
export function getClientIP(request: NextRequest): string {
  return getTrustedProxyClientIP(request.headers);
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
  // Chat/writer streaming - 20 requests per minute, with AI budget enforced separately
  chat: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: "chat",
  },
  // Offline command processing - lower because each command can fan out to agents
  commands: {
    windowMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: "commands",
  },
  // Public demo login - deliberately low to protect demo accounts from abuse
  demoLogin: {
    windowMs: 60 * 1000,
    maxRequests: 5,
    keyPrefix: "demo-login",
  },
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
export async function applyRateLimit(
  request: NextRequest,
  config: RateLimitConfig
): Promise<{ allowed: true } | { allowed: false; response: NextResponse }> {
  const clientIP = getClientIP(request);
  const bucket = config.keyPrefix || "default";
  const result = await checkPersistentRateLimit(clientIP, bucket, config.maxRequests, config.windowMs);
  
  if (!result.allowed) {
    return {
      allowed: false,
      response: NextResponse.json(
        {
          error: "Too Many Requests",
          code: "RATE_LIMIT_EXCEEDED",
          message: `Rate limit exceeded. Try again after ${Math.ceil((result.resetAt - Date.now()) / 1000)} seconds.`,
          limit: result.limit,
          remaining: result.remaining,
          resetAt: result.resetAt,
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
            "X-RateLimit-Limit": String(result.limit),
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
    const rateLimitResult = await applyRateLimit(request, rateLimit);
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
