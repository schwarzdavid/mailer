ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 TURBO_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v11 \
    pnpm fetch
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v11 \
    pnpm install --frozen-lockfile --prefer-offline
RUN pnpm turbo run build --filter=frontend
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store/v11 \
    pnpm --filter backend deploy --legacy --prod /out

FROM node:${NODE_VERSION}-slim AS backend
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out /app
COPY --from=build /repo/apps/frontend/dist /app/public
USER node
EXPOSE 8000
CMD ["node", "dist/main.js"]
