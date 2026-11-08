FROM oven/bun:1.4.4-alpine

WORKDIR /app
ENV NODE_ENV=production

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY tsconfig.json ./
COPY src ./src
RUN mkdir -p /app/data && chown bun:bun /app/data

USER bun
CMD ["bun", "src/index.ts"]
