import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  updateBountyProgressHandler,
  type BountyProgressClient,
} from "../../shared/update-bounty-progress-handler.ts";

// Called by the Next.js API after every measurement insert. The criteria
// logic lives in the shared handler so it stays unit-testable.
Deno.serve((req) =>
  updateBountyProgressHandler(req, () =>
    createClientFromRequest(req) as unknown as BountyProgressClient,
  ),
);
