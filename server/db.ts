import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
import * as schema from "@shared/schema";

neonConfig.webSocketConstructor = ws;

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

/**
 * Get the database connection pool and Drizzle instance.
 * Lazily initialized on first call. Throws if DATABASE_URL is not set.
 */
export function getDb() {
  if (!_db) {
    if (!process.env.DATABASE_URL) {
      throw new Error(
        "DATABASE_URL must be set. Did you forget to provision a database?",
      );
    }
    _pool = new Pool({ connectionString: process.env.DATABASE_URL });
    _db = drizzle({ client: _pool, schema });
  }
  return _db;
}

/**
 * Check if a database connection is available (DATABASE_URL is set).
 */
export function isDatabaseAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

/**
 * Get the connection pool (for connect-pg-simple session store).
 * Must be called after getDb() has been called at least once.
 */
export function getPool(): Pool {
  if (!_pool) {
    getDb(); // Initialize pool
  }
  return _pool!;
}

// Backwards-compatible exports for existing code that imports db/pool directly
// These will throw if DATABASE_URL is not set, maintaining the original behavior
export const pool = new Proxy({} as Pool, {
  get(_, prop) {
    return Reflect.get(getPool(), prop);
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    return Reflect.get(getDb(), prop);
  },
});
