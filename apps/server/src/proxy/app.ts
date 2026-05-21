import { Hono } from "hono";
import { forwardRoutes } from "./forward";
import { healthRoutes } from "./health";
import { internalRoutes } from "./internal";

const app = new Hono();

export const proxyApp = app
  .route("/", healthRoutes)
  .route("/internal", internalRoutes)
  .route("/", forwardRoutes);

export type AppType = typeof proxyApp;
