import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();

// `generate` only reads the schema, so credentials are optional here;
// commands that talk to the database (push/pull/studio) still need DATABASE_URL.
const databaseUrl = process.env.DATABASE_URL;

export default defineConfig({
  schema: "./src/lib/supabase/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  ...(databaseUrl ? { dbCredentials: { url: databaseUrl } } : {}),
});
