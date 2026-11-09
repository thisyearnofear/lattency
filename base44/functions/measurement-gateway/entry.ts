import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  measurementGatewayHandler,
  type GatewayClient,
} from "../../shared/measurement-gateway-handler.ts";

Deno.serve((req) =>
  measurementGatewayHandler(
    req,
    Deno.env.get("LATTENCY_SERVER_KEY"),
    () => createClientFromRequest(req) as unknown as GatewayClient,
  ),
);
