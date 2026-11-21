# Imagem de produção do CodeArena: API, Socket.IO e interface num servidor só, na porta 3000.
# Os dados (packs e histórico) ficam em /data: monte um volume para não perdê-los ao atualizar.

FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build
# O servidor roda com tsx (dependência de desenvolvimento), então as dependências ficam todas.

FROM base AS runtime
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 CODEARENA_DATA_DIR=/data
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"
# Sem pnpm na execução: o Node carrega o TypeScript do servidor pelo tsx.
WORKDIR /app/apps/server
CMD ["node", "--import", "tsx", "src/index.ts"]
