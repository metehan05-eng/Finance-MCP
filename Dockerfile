# finans-mcp — MCP sunucusu (stdio)
#
# Kullanım:
#   docker build -t finans-mcp .
#   docker run -i --rm finans-mcp
# (Claude Desktop / Cursor config içinde stdio ile bağlanır)

FROM node:22-alpine AS build
WORKDIR /app

# Bağımlılıkları önce kopyala (katman önbelleği için)
COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Yalnızca çalışma zamanı bağımlılıkları + derlenmiş çıktı
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/package.json ./package.json
COPY scripts ./scripts
COPY README.md LICENSE ./

# root olmayan kullanıcı
USER node

# MCP stdio üzerinden çalışır; sağlık kontrolü TCP değildir.
ENTRYPOINT ["node", "build/index.js"]
