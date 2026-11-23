/**
 * Server -> client row serialization shared by the sync routes:
 * snake_case keys become camelCase and Date values become epoch milliseconds,
 * which is the shape the IndexedDB cache in lib/sync/engine.ts stores.
 */
export function toClientFormat(record: unknown): Record<string, unknown> {
  if (!record || typeof record !== 'object') return {};
  
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    // Convert snake_case to camelCase
    const clientKey = key.replace(/_([a-z])/g, (_, char) => char.toUpperCase());
    
    // Convert Date objects to timestamps
    if (value instanceof Date) {
      result[clientKey] = value.getTime();
    } else {
      result[clientKey] = value;
    }
  }

  return result;
}
