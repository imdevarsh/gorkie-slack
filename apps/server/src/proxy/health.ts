import { Hono } from "hono";
import { listProviders } from "./providers";

export const healthRoutes = new Hono().get("/health", (c) =>
  c.json({
    ok: true,
    providers: listProviders(),
  })
);
