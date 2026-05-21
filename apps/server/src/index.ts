import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger as honoLogger } from "hono/logger";
import { env } from "../env";
import logger from "./logger";

const app = new Hono();

app.use(honoLogger((message) => logger.info(message)));
app.use(
  "/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowMethods: ["GET", "POST", "OPTIONS"],
  })
);

app.get("/", (c) => c.text("OK"));

export default {
  fetch: app.fetch,
  port: env.PORT,
};
