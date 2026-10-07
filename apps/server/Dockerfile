FROM oven/bun:1.3.4 AS build

WORKDIR /app
COPY package.json bun.lock turbo.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages packages
RUN bun install --frozen-lockfile

COPY apps/server apps/server
RUN NODE_ENV=production bun --filter server build

FROM oven/bun:1.3.4-slim
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/dist ./dist
COPY --from=build /app/apps/server/package.json ./package.json
COPY --from=build /app/packages/db ./packages/db
COPY apps/server/docker-entrypoint.sh ./docker-entrypoint.sh
EXPOSE 3002
CMD ["sh", "docker-entrypoint.sh"]
