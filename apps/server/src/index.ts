import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { env } from "./env";
import logger from "./logger";
import { proxyApp } from "./proxy/app";

const app = new Hono();

app.use(honoLogger((message) => logger.info(message)));
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Authorization", "Content-Type"],
  })
);

app.get("/", (c) => c.text("OK"));
app.route("/", proxyApp);

app.onError((error, c) => {
  logger.error({ err: error, path: c.req.path }, "[server] unhandled error");
  return c.json({ message: "Internal Server Error", status: 500 }, 500);
});

export default {
  fetch: app.fetch,
  port: env.PORT,
};
