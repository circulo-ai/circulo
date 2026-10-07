FROM oven/bun:1.3.4 AS build

WORKDIR /app
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_BETTER_AUTH_URL=http://localhost:3002
ARG NEXT_PUBLIC_CIRCULO_RUNTIME_KIND=cloud
ARG SERVER_API_URL=http://server:3002
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_CIRCULO_RUNTIME_KIND=$NEXT_PUBLIC_CIRCULO_RUNTIME_KIND
ENV SERVER_API_URL=$SERVER_API_URL

COPY package.json bun.lock turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages packages
RUN bun install --frozen-lockfile

COPY apps/web apps/web
RUN bun --filter web build

FROM oven/bun:1.3.4-slim
WORKDIR /app
ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public
EXPOSE 3000
CMD ["bun", "apps/web/server.js"]
