import { callCronRoute } from "../lib/call-cron-route.mts";

type Config = { schedule: string };

/** Deletes sold-out products 30 days after archive and unpaid orders older than 30 days. */
export default async (_req: Request, context: { site?: { url?: string } }) => {
  await callCronRoute("/api/cron/lifecycle-cleanup", context);
};

export const config: Config = {
  schedule: "45 * * * *",
};
