FROM node:22-bookworm-slim AS build
WORKDIR /app

RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/client/package.json apps/client/
COPY packages/shared-types/package.json packages/shared-types/
RUN pnpm install --frozen-lockfile

COPY tsconfig.base.json ./
COPY apps/client/ apps/client/
COPY packages/shared-types/ packages/shared-types/
RUN pnpm --filter @webtps/client build

FROM nginx:1.27-alpine AS runtime
COPY apps/client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/client/dist /usr/share/nginx/html
EXPOSE 3001
