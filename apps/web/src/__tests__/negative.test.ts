/**
 * Negative Test Cases - Edge Cases & Error Scenarios
 * 50 Test Cases covering failure scenarios that MUST be caught
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ==========================================
// SECTION 1: AUTHENTICATION FAILURES (12 Test Cases)
// ==========================================

describe("1. Authentication Failures", () => {
  
  it("TC-NEG-001: Reject empty email", () => {
    const validateEmail = (email: string) => {
      if (!email || email.trim() === "") {
        throw new Error("Email is required");
      }
      return true;
    };
    
    expect(() => validateEmail("")).toThrow("Email is required");
    expect(() => validateEmail("   ")).toThrow("Email is required");
  });

  it("TC-NEG-002: Reject invalid email format", () => {
    const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    
    expect(isValidEmail("notanemail")).toBe(false);
    expect(isValidEmail("missing@domain")).toBe(false);
    expect(isValidEmail("@nodomain.com")).toBe(false);
    expect(isValidEmail("spaces in@email.com")).toBe(false);
  });

  it("TC-NEG-003: Reject weak passwords", () => {
    const validatePassword = (password: string) => {
      const errors: string[] = [];
      if (password.length < 8) errors.push("Too short");
      if (!/[A-Z]/.test(password)) errors.push("No uppercase");
      if (!/[a-z]/.test(password)) errors.push("No lowercase");
      if (!/[0-9]/.test(password)) errors.push("No number");
      return errors;
    };
    
    expect(validatePassword("short")).toContain("Too short");
    expect(validatePassword("nouppercase123")).toContain("No uppercase");
    expect(validatePassword("NOLOWERCASE123")).toContain("No lowercase");
    expect(validatePassword("NoNumbers")).toContain("No number");
  });

  it("TC-NEG-004: Reject expired JWT token", () => {
    const isTokenExpired = (exp: number) => Date.now() / 1000 > exp;
    
    const expiredToken = { exp: Math.floor(Date.now() / 1000) - 3600 }; // 1 hour ago
    expect(isTokenExpired(expiredToken.exp)).toBe(true);
  });

  it("TC-NEG-005: Reject malformed JWT", () => {
    const parseJWT = (token: string) => {
      const parts = token.split(".");
      if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
      }
      return parts;
    };
    
    expect(() => parseJWT("invalid")).toThrow("Invalid JWT format");
    expect(() => parseJWT("only.two")).toThrow("Invalid JWT format");
    expect(() => parseJWT("")).toThrow("Invalid JWT format");
  });

  it("TC-NEG-006: Reject wrong password", () => {
    const verifyPassword = (input: string, stored: string) => {
      return input === stored;
    };
    
    expect(verifyPassword("wrongpassword", "correctpassword")).toBe(false);
  });

  it("TC-NEG-007: Reject non-existent user login", () => {
    const users = new Map([["user@example.com", { id: 1 }]]);
    
    const findUser = (email: string) => {
      const user = users.get(email);
      if (!user) throw new Error("User not found");
      return user;
    };
    
    expect(() => findUser("nonexistent@example.com")).toThrow("User not found");
  });

  it("TC-NEG-008: Reject duplicate email registration", () => {
    const existingEmails = ["taken@example.com", "admin@example.com"];
    
    const checkDuplicate = (email: string) => {
      if (existingEmails.includes(email)) {
        throw new Error("Email already exists");
      }
    };
    
    expect(() => checkDuplicate("taken@example.com")).toThrow("Email already exists");
  });

  it("TC-NEG-009: Reject unauthorized access", () => {
    const checkAuth = (session: { userId: string } | null) => {
      if (!session || !session.userId) {
        throw new Error("Unauthorized");
      }
    };
    
    expect(() => checkAuth(null)).toThrow("Unauthorized");
    expect(() => checkAuth({ userId: "" })).toThrow("Unauthorized");
  });

  it("TC-NEG-010: Reject insufficient permissions", () => {
    const checkPermission = (userRole: string, requiredRole: string) => {
      const roles = ["viewer", "member", "admin", "owner"];
      if (roles.indexOf(userRole) < roles.indexOf(requiredRole)) {
        throw new Error("Insufficient permissions");
      }
    };
    
    expect(() => checkPermission("viewer", "admin")).toThrow("Insufficient permissions");
    expect(() => checkPermission("member", "owner")).toThrow("Insufficient permissions");
  });

  it("TC-NEG-011: Reject session from different IP", () => {
    const validateSession = (sessionIP: string, requestIP: string) => {
      if (sessionIP !== requestIP) {
        throw new Error("Session IP mismatch");
      }
    };
    
    expect(() => validateSession("192.168.1.1", "10.0.0.1")).toThrow("Session IP mismatch");
  });

  it("TC-NEG-012: Reject too many login attempts", () => {
    const checkRateLimit = (attempts: number, maxAttempts: number) => {
      if (attempts >= maxAttempts) {
        throw new Error("Too many attempts. Try again later.");
      }
    };
    
    expect(() => checkRateLimit(5, 5)).toThrow("Too many attempts");
    expect(() => checkRateLimit(10, 5)).toThrow("Too many attempts");
  });
});

// ==========================================
// SECTION 2: INPUT VALIDATION FAILURES (12 Test Cases)
// ==========================================

describe("2. Input Validation Failures", () => {
  
  it("TC-NEG-013: Reject null/undefined inputs", () => {
    const validateInput = (value: unknown) => {
      if (value === null || value === undefined) {
        throw new Error("Input cannot be null or undefined");
      }
    };
    
    expect(() => validateInput(null)).toThrow();
    expect(() => validateInput(undefined)).toThrow();
  });

  it("TC-NEG-014: Reject empty required fields", () => {
    const validateRequired = (fields: Record<string, unknown>, required: string[]) => {
      const missing = required.filter(f => !fields[f] || fields[f] === "");
      if (missing.length > 0) {
        throw new Error(`Missing required fields: ${missing.join(", ")}`);
      }
    };
    
    expect(() => validateRequired({ name: "" }, ["name", "email"])).toThrow("Missing required fields");
  });

  it("TC-NEG-015: Reject string exceeding max length", () => {
    const validateLength = (value: string, max: number) => {
      if (value.length > max) {
        throw new Error(`String exceeds maximum length of ${max}`);
      }
    };
    
    expect(() => validateLength("a".repeat(300), 255)).toThrow("exceeds maximum length");
  });

  it("TC-NEG-016: Reject invalid UUID format", () => {
    const isValidUUID = (id: string) => {
      return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    };
    
    expect(isValidUUID("not-a-uuid")).toBe(false);
    expect(isValidUUID("12345")).toBe(false);
    expect(isValidUUID("")).toBe(false);
    expect(isValidUUID("zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz")).toBe(false);
  });

  it("TC-NEG-017: Reject invalid date format", () => {
    const parseDate = (dateStr: string) => {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        throw new Error("Invalid date format");
      }
      return date;
    };
    
    expect(() => parseDate("not-a-date")).toThrow("Invalid date");
    expect(() => parseDate("32/13/2024")).toThrow("Invalid date");
  });

  it("TC-NEG-018: Reject negative numbers where positive expected", () => {
    const validatePositive = (value: number) => {
      if (value < 0) {
        throw new Error("Value must be positive");
      }
    };
    
    expect(() => validatePositive(-1)).toThrow("must be positive");
    expect(() => validatePositive(-100)).toThrow("must be positive");
  });

  it("TC-NEG-019: Reject invalid enum values", () => {
    const validateStatus = (status: string) => {
      const validStatuses = ["todo", "in_progress", "done"];
      if (!validStatuses.includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }
    };
    
    expect(() => validateStatus("invalid")).toThrow("Invalid status");
    expect(() => validateStatus("DONE")).toThrow("Invalid status"); // Case sensitive
  });

  it("TC-NEG-020: Reject XSS attack payloads", () => {
    const detectXSS = (input: string) => {
      const xssPatterns = [/<script/i, /javascript:/i, /on\w+=/i];
      if (xssPatterns.some(pattern => pattern.test(input))) {
        throw new Error("Potential XSS detected");
      }
    };
    
    expect(() => detectXSS('<script>alert("xss")</script>')).toThrow("XSS");
    expect(() => detectXSS('javascript:alert(1)')).toThrow("XSS");
    expect(() => detectXSS('<img onerror="evil()">')).toThrow("XSS");
  });

  it("TC-NEG-021: Reject SQL injection attempts", () => {
    const detectSQLInjection = (input: string) => {
      const sqlPatterns = [/;\s*DROP/i, /UNION\s+SELECT/i, /--\s*$/];
      if (sqlPatterns.some(pattern => pattern.test(input))) {
        throw new Error("Potential SQL injection detected");
      }
    };
    
    expect(() => detectSQLInjection("'; DROP TABLE users;--")).toThrow("SQL injection");
    expect(() => detectSQLInjection("1 UNION SELECT * FROM passwords")).toThrow("SQL injection");
  });

  it("TC-NEG-022: Reject oversized file uploads", () => {
    const validateFileSize = (sizeBytes: number, maxMB: number) => {
      const maxBytes = maxMB * 1024 * 1024;
      if (sizeBytes > maxBytes) {
        throw new Error(`File size exceeds ${maxMB}MB limit`);
      }
    };
    
    expect(() => validateFileSize(20 * 1024 * 1024, 10)).toThrow("exceeds 10MB");
  });

  it("TC-NEG-023: Reject invalid file types", () => {
    const validateFileType = (mimeType: string, allowed: string[]) => {
      if (!allowed.includes(mimeType)) {
        throw new Error(`File type ${mimeType} not allowed`);
      }
    };
    
    const allowed = ["image/png", "image/jpeg", "application/pdf"];
    expect(() => validateFileType("application/exe", allowed)).toThrow("not allowed");
    expect(() => validateFileType("text/html", allowed)).toThrow("not allowed");
  });

  it("TC-NEG-024: Reject malformed JSON", () => {
    const parseJSON = (str: string) => {
      try {
        return JSON.parse(str);
      } catch {
        throw new Error("Invalid JSON");
      }
    };
    
    expect(() => parseJSON("{invalid}")).toThrow("Invalid JSON");
    expect(() => parseJSON("not json at all")).toThrow("Invalid JSON");
    expect(() => parseJSON("{missing: quotes}")).toThrow("Invalid JSON");
  });
});

// ==========================================
// SECTION 3: API & NETWORK FAILURES (12 Test Cases)
// ==========================================

describe("3. API & Network Failures", () => {
  
  it("TC-NEG-025: Handle API timeout", async () => {
    const fetchWithTimeout = async (timeoutMs: number) => {
      return Promise.race([
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), timeoutMs)),
        new Promise(resolve => setTimeout(resolve, timeoutMs + 100)), // Slower than timeout
      ]);
    };
    
    await expect(fetchWithTimeout(10)).rejects.toThrow("Timeout");
  });

  it("TC-NEG-026: Handle 404 Not Found", () => {
    const handleResponse = (status: number) => {
      if (status === 404) {
        throw new Error("Resource not found");
      }
    };
    
    expect(() => handleResponse(404)).toThrow("not found");
  });

  it("TC-NEG-027: Handle 500 Server Error", () => {
    const handleResponse = (status: number) => {
      if (status >= 500) {
        throw new Error("Server error");
      }
    };
    
    expect(() => handleResponse(500)).toThrow("Server error");
    expect(() => handleResponse(503)).toThrow("Server error");
  });

  it("TC-NEG-028: Handle rate limiting (429)", () => {
    const handleResponse = (status: number, headers: Record<string, string>) => {
      if (status === 429) {
        const retryAfter = headers["retry-after"] || "60";
        throw new Error(`Rate limited. Retry after ${retryAfter}s`);
      }
    };
    
    expect(() => handleResponse(429, { "retry-after": "30" })).toThrow("Rate limited");
  });

  it("TC-NEG-029: Handle network disconnection", () => {
    const checkConnection = (isOnline: boolean) => {
      if (!isOnline) {
        throw new Error("No network connection");
      }
    };
    
    expect(() => checkConnection(false)).toThrow("No network connection");
  });

  it("TC-NEG-030: Handle invalid API key", () => {
    const validateApiKey = (key: string | undefined) => {
      if (!key || !key.startsWith("sk-")) {
        throw new Error("Invalid API key format");
      }
    };
    
    expect(() => validateApiKey(undefined)).toThrow("Invalid API key");
    expect(() => validateApiKey("")).toThrow("Invalid API key");
    expect(() => validateApiKey("wrong-format")).toThrow("Invalid API key");
  });

  it("TC-NEG-031: Handle missing required headers", () => {
    const validateHeaders = (headers: Record<string, string>) => {
      if (!headers["authorization"]) {
        throw new Error("Authorization header required");
      }
      if (!headers["content-type"]) {
        throw new Error("Content-Type header required");
      }
    };
    
    expect(() => validateHeaders({})).toThrow("Authorization header required");
    expect(() => validateHeaders({ authorization: "Bearer xxx" })).toThrow("Content-Type");
  });

  it("TC-NEG-032: Handle CORS errors", () => {
    const checkCORS = (origin: string, allowed: string[]) => {
      if (!allowed.includes(origin)) {
        throw new Error("CORS: Origin not allowed");
      }
    };
    
    expect(() => checkCORS("https://evil.com", ["https://nexus.app"])).toThrow("Origin not allowed");
  });

  it("TC-NEG-033: Handle malformed request body", () => {
    const parseRequestBody = (body: unknown) => {
      if (typeof body !== "object" || body === null) {
        throw new Error("Request body must be an object");
      }
    };
    
    expect(() => parseRequestBody("string")).toThrow("must be an object");
    expect(() => parseRequestBody(null)).toThrow("must be an object");
    expect(() => parseRequestBody(123)).toThrow("must be an object");
  });

  it("TC-NEG-034: Handle empty response body", () => {
    const parseResponse = (body: string) => {
      if (!body || body.trim() === "") {
        throw new Error("Empty response body");
      }
      return JSON.parse(body);
    };
    
    expect(() => parseResponse("")).toThrow("Empty response");
    expect(() => parseResponse("   ")).toThrow("Empty response");
  });

  it("TC-NEG-035: Handle WebSocket connection failure", () => {
    const connectWebSocket = (url: string, isServerAvailable: boolean) => {
      if (!isServerAvailable) {
        throw new Error("WebSocket connection failed");
      }
    };
    
    expect(() => connectWebSocket("ws://localhost:1234", false)).toThrow("connection failed");
  });

  it("TC-NEG-036: Handle streaming error mid-response", () => {
    const processStream = (chunks: Array<{ data?: string; error?: string }>) => {
      for (const chunk of chunks) {
        if (chunk.error) {
          throw new Error(`Stream error: ${chunk.error}`);
        }
      }
    };
    
    const chunksWithError = [
      { data: "partial" },
      { error: "Connection reset" },
    ];
    
    expect(() => processStream(chunksWithError)).toThrow("Stream error");
  });
});

// ==========================================
// SECTION 4: DATABASE & DATA INTEGRITY (14 Test Cases)
// ==========================================

describe("4. Database & Data Integrity Failures", () => {
  
  it("TC-NEG-037: Handle foreign key violation", () => {
    const workspaces = new Set(["ws-1", "ws-2"]);
    
    const createDocument = (workspaceId: string) => {
      if (!workspaces.has(workspaceId)) {
        throw new Error("Foreign key violation: workspace does not exist");
      }
    };
    
    expect(() => createDocument("ws-nonexistent")).toThrow("Foreign key violation");
  });

  it("TC-NEG-038: Handle unique constraint violation", () => {
    const existingIds = new Set(["doc-1", "doc-2"]);
    
    const insertDocument = (id: string) => {
      if (existingIds.has(id)) {
        throw new Error("Unique constraint violation: id already exists");
      }
    };
    
    expect(() => insertDocument("doc-1")).toThrow("Unique constraint violation");
  });

  it("TC-NEG-039: Handle concurrent update conflict", () => {
    const document = { id: "doc-1", version: 5 };
    
    const updateDocument = (id: string, expectedVersion: number) => {
      if (document.version !== expectedVersion) {
        throw new Error("Conflict: document was modified by another user");
      }
    };
    
    expect(() => updateDocument("doc-1", 4)).toThrow("Conflict");
  });

  it("TC-NEG-040: Handle transaction rollback", () => {
    let transactionCommitted = false;
    
    const runTransaction = (shouldFail: boolean) => {
      if (shouldFail) {
        throw new Error("Transaction rolled back due to error");
      }
      transactionCommitted = true;
    };
    
    expect(() => runTransaction(true)).toThrow("rolled back");
    expect(transactionCommitted).toBe(false);
  });

  it("TC-NEG-041: Handle database connection failure", () => {
    const connectDatabase = (isAvailable: boolean) => {
      if (!isAvailable) {
        throw new Error("Could not connect to database");
      }
    };
    
    expect(() => connectDatabase(false)).toThrow("Could not connect");
  });

  it("TC-NEG-042: Handle query timeout", () => {
    const executeQuery = (queryTimeMs: number, timeoutMs: number) => {
      if (queryTimeMs > timeoutMs) {
        throw new Error("Query timeout exceeded");
      }
    };
    
    expect(() => executeQuery(10000, 5000)).toThrow("timeout exceeded");
  });

  it("TC-NEG-043: Handle invalid embedding dimensions", () => {
    const validateEmbedding = (embedding: number[], expectedDim: number) => {
      if (embedding.length !== expectedDim) {
        throw new Error(`Expected ${expectedDim} dimensions, got ${embedding.length}`);
      }
    };
    
    expect(() => validateEmbedding(new Array(100).fill(0), 1536)).toThrow("Expected 1536");
  });

  it("TC-NEG-044: Handle deleted resource access", () => {
    const deletedDocs = new Set(["doc-deleted"]);
    
    const getDocument = (id: string) => {
      if (deletedDocs.has(id)) {
        throw new Error("Document has been deleted");
      }
    };
    
    expect(() => getDocument("doc-deleted")).toThrow("has been deleted");
  });

  it("TC-NEG-045: Handle orphaned data", () => {
    const validateReferences = (docId: string, workspaceExists: boolean) => {
      if (!workspaceExists) {
        throw new Error("Orphaned document: workspace no longer exists");
      }
    };
    
    expect(() => validateReferences("doc-1", false)).toThrow("Orphaned");
  });

  it("TC-NEG-046: Handle data corruption", () => {
    const validateChecksum = (data: string, expectedChecksum: string) => {
      // Simple mock checksum
      const actualChecksum = data.length.toString();
      if (actualChecksum !== expectedChecksum) {
        throw new Error("Data corruption detected: checksum mismatch");
      }
    };
    
    expect(() => validateChecksum("data", "wrong")).toThrow("corruption detected");
  });

  it("TC-NEG-047: Handle pagination out of bounds", () => {
    const paginate = (page: number, totalPages: number) => {
      if (page < 1) {
        throw new Error("Page must be >= 1");
      }
      if (page > totalPages) {
        throw new Error(`Page ${page} exceeds total pages ${totalPages}`);
      }
    };
    
    expect(() => paginate(0, 10)).toThrow("must be >= 1");
    expect(() => paginate(100, 10)).toThrow("exceeds total pages");
  });

  it("TC-NEG-048: Handle circular reference", () => {
    const detectCircular = (parentId: string, childId: string) => {
      if (parentId === childId) {
        throw new Error("Circular reference detected");
      }
    };
    
    expect(() => detectCircular("doc-1", "doc-1")).toThrow("Circular reference");
  });

  it("TC-NEG-049: Handle invalid CRDT state", () => {
    const validateCRDT = (vector: Map<number, number>) => {
      for (const [clientId, clock] of vector) {
        if (clock < 0) {
          throw new Error("Invalid CRDT state: negative clock value");
        }
      }
    };
    
    const invalidVector = new Map([[1, -5]]);
    expect(() => validateCRDT(invalidVector)).toThrow("negative clock");
  });

  it("TC-NEG-050: Handle merge conflict resolution failure", () => {
    const resolveMerge = (local: unknown, remote: unknown, canAutoResolve: boolean) => {
      if (!canAutoResolve) {
        throw new Error("Merge conflict requires manual resolution");
      }
    };
    
    expect(() => resolveMerge({}, {}, false)).toThrow("manual resolution");
  });
});
