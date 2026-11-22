import { Pool, type PoolClient, type QueryResultRow } from "pg";

const globalForDb = globalThis as unknown as {
  supabasePool?: Pool;
  supabaseUrl?: string;
};

/**
 * Service connection to the Supabase Postgres database.
 * The backend uses the database role directly so it can create tables
 * and read or write user, code, and session rows.
 */
export function createSupabaseClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set.");
  }

  if (
    !globalForDb.supabasePool ||
    globalForDb.supabaseUrl !== connectionString
  ) {
    void globalForDb.supabasePool?.end();
    const pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
      max: 5,
      connectionTimeoutMillis: 20_000,
      application_name: "auth-backend",
    });
    pool.on("error", (error) => {
      console.error("Supabase pool error", error);
    });
    globalForDb.supabasePool = pool;
    globalForDb.supabaseUrl = connectionString;
  }

  return globalForDb.supabasePool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[],
) {
  const result = params
    ? await createSupabaseClient().query<T>(text, params)
    : await createSupabaseClient().query<T>(text);
  return result.rows;
}

export async function withTransaction<T>(
  run: (client: PoolClient) => Promise<T>,
) {
  const client = await createSupabaseClient().connect();
  try {
    await client.query("begin");
    const value = await run(client);
    await client.query("commit");
    return value;
  } catch (error) {
    try {
      await client.query("rollback");
    } catch {
      // The connection is already unusable.
    }
    throw error;
  } finally {
    client.release();
  }
}
