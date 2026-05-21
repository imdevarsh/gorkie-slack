import { Hono } from "hono";
import { forwardRoutes } from "./forward";
import { healthRoutes } from "./health";

const app = new Hono();

export const proxyApp = app.route("/", healthRoutes).route("/", forwardRoutes);

export type AppType = typeof proxyApp;
