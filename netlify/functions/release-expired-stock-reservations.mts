type Config = { schedule: string };

declare const Netlify: { env: { get(key: string): string | undefined } };

export default async (_req: Request, context: { site?: { url?: string } }) => {
  const secret = Netlify.env.get("CRON_SECRET")?.trim();
  if (!secret) {
    console.error("[cron] CRON_SECRET is not set; skipping stock release");
    return;
  }

  const baseUrl = (Netlify.env.get("URL") ?? context.site?.url ?? "").replace(
    /\/$/,
    "",
  );
  if (!baseUrl) {
    console.error("[cron] Site URL unavailable; skipping stock release");
    return;
  }

  const res = await fetch(
    `${baseUrl}/api/cron/release-expired-stock-reservations`,
    { headers: { Authorization: `Bearer ${secret}` } },
  );
  const body = await res.text();
  if (!res.ok) {
    console.error(`[cron] stock release failed (${res.status}): ${body}`);
    return;
  }
  console.log(`[cron] stock release ok: ${body}`);
};

export const config: Config = {
  schedule: "15 * * * *",
};
