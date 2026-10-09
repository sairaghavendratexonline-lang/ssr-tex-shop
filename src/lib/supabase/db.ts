import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env.mjs";
import * as schema from "./schema";
import { resolveDatabaseUrl } from "./resolve-database-url";
import { buildPostgresClientOptions } from "./postgres-client-options";

const connectionString = resolveDatabaseUrl(env.DATABASE_URL);

if (!connectionString) {
  console.log("🔴 no database URL");
}

/** Serverless: one connection per instance; transaction pooler (6543) handles concurrency. */
const isServerless =
  process.env.VERCEL === "1" ||
  process.env.NETLIFY === "true" ||
  Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);

const client = postgres(
  connectionString,
  buildPostgresClientOptions(isServerless ? 1 : 3),
);

const db = drizzle(client, { schema });

export default db;
