import "server-only";
import { createClient } from "@base44/sdk";

export class ContributionGatewayUnavailable extends Error {
  constructor() {
    super("Contribution gateway unavailable");
    this.name = "ContributionGatewayUnavailable";
  }
}

export function getBase44Gateway() {
  const appId = process.env.NEXT_PUBLIC_BASE44_APP_ID;
  const secret = process.env.LATTENCY_SERVER_KEY;
  if (!appId || !secret || secret.length < 32) {
    throw new ContributionGatewayUnavailable();
  }
  return createClient({
    appId,
    headers: { "x-lattency-server-key": secret },
  });
}
