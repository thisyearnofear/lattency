import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  createCafeHandler,
  type CafeCreationClient,
} from "../../shared/create-cafe-handler.ts";

Deno.serve((req) =>
  createCafeHandler(req, Deno.env.get("LATTENCY_SERVER_KEY"), () =>
    createClientFromRequest(req) as unknown as CafeCreationClient,
  ),
);
