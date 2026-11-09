import { createClientFromRequest } from "npm:@base44/sdk@0.8.40";
import {
  listCafesHandler,
  type ListCafesClient,
} from "../../shared/list-cafes-handler.ts";

Deno.serve((req) =>
  listCafesHandler(
    req,
    () => createClientFromRequest(req) as unknown as ListCafesClient,
  ),
);
