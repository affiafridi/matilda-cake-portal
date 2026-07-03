import "server-only";
import { Pool, type QueryResult, type QueryResultRow } from "pg";

const globalForBotDb = globalThis as unknown as { botPool: Pool | undefined };

function getPool(): Pool {
  if (globalForBotDb.botPool) return globalForBotDb.botPool;

  const connectionString = process.env.BOT_DATABASE_URL;
  if (!connectionString) throw new Error("BOT_DATABASE_URL is not set");

  // Prisma supports ?host=/cloudsql/... for Unix sockets but pg does not.
  // Extract the socket path and build pg config manually.
  const socketMatch = connectionString.match(/[?&]host=([^&]+)/);
  if (socketMatch) {
    const socketPath = decodeURIComponent(socketMatch[1]);
    const baseUrl = new URL(connectionString.replace(/[?&]host=[^&]+/, "").replace(/[?&]$/, "").replace(/\?$/, ""));
    globalForBotDb.botPool = new Pool({
      user: baseUrl.username,
      password: decodeURIComponent(baseUrl.password),
      database: baseUrl.pathname.replace(/^\//, ""),
      host: socketPath,
    });
  } else {
    globalForBotDb.botPool = new Pool({ connectionString });
  }

  return globalForBotDb.botPool;
}

export async function botQuery<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  values?: unknown[],
): Promise<QueryResult<T>> {
  return getPool().query<T>(sql, values);
}
