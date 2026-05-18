// import { Logger } from "drizzle-orm";
import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// class MyLogger implements Logger {
//   logQuery(query: string, params: unknown[]): void {
//     console.log({ query, params });
//   }
// }

const globalPg = globalThis as typeof globalThis & {
  __betterChatbotPgPool?: Pool;
};

const pool =
  globalPg.__betterChatbotPgPool ??
  new Pool({
    connectionString: process.env.POSTGRES_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalPg.__betterChatbotPgPool = pool;
}

export const pgDb = drizzlePg(pool, {
  // logger: new MyLogger(),
});
