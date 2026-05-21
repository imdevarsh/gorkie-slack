import logger from "@/lib/logger";
import { proxyApp } from "./app";

export function startProxyServer(port: number): void {
  Bun.serve({ fetch: proxyApp.fetch, port });
  logger.info({ port }, "[proxy] API key proxy listening");
}
