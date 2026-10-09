declare const Netlify: { env: { get(key: string): string | undefined } };

export async function callCronRoute(
  path: string,
  context: { site?: { url?: string } },
): Promise<void> {
  const label = path.split("/").pop() ?? path;
  const secret = Netlify.env.get("CRON_SECRET")?.trim();
  if (!secret) {
    console.error(`[cron] CRON_SECRET is not set; skipping ${label}`);
    return;
  }

  const baseUrl = (Netlify.env.get("URL") ?? context.site?.url ?? "").replace(
    /\/$/,
    "",
  );
  if (!baseUrl) {
    console.error(`[cron] Site URL unavailable; skipping ${label}`);
    return;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  const body = await res.text();
  if (!res.ok) {
    console.error(`[cron] ${label} failed (${res.status}): ${body}`);
    return;
  }
  console.log(`[cron] ${label} ok: ${body}`);
}
