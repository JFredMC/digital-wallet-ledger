# syntax=docker/dockerfile:1
# Build context: repository root (see docker-compose.yml).

ARG NODE_IMAGE=node:24-alpine

# ---- build Angular ----------------------------------------------------------
FROM ${NODE_IMAGE} AS build
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter web
COPY apps/web apps/web
RUN pnpm --filter web build

# ---- serve with nginx -------------------------------------------------------
FROM nginx:stable-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1/ > /dev/null || exit 1
