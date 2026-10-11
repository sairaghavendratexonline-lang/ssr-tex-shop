import { buildPostgresClientOptions } from "@/lib/supabase/postgres-client-options";

describe("buildPostgresClientOptions", () => {
  it("disables prepared statements and pipelining for Supabase pooler", () => {
    const options = buildPostgresClientOptions(1);
    expect(options.prepare).toBe(false);
    expect(options.max_pipeline).toBe(0);
    expect(options.max).toBe(1);
  });

  it("caps statements so a slow query cannot hold a pooler slot", () => {
    expect(buildPostgresClientOptions(1).connection.statement_timeout).toBe(
      8000,
    );
  });
});
