FROM oven/bun:1 AS base
RUN apt-get update && apt-get install -y git && rm -rf /var/lib/apt/lists/*
WORKDIR /usr/src/app

FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lock /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile --ignore-scripts

FROM base AS release
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

RUN mkdir -p logs && chown -R bun:bun /usr/src/app
ENV NODE_ENV=production
USER bun
CMD ["sh", "-c", "bun run db:push && bun run server/index.ts"]
