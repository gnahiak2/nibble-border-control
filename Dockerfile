FROM oven/bun:1-alpine

WORKDIR /app
ENV NODE_ENV=production

# deps first, so this layer caches while src changes
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

COPY src ./src

# the container runs as the non-root bun user; seed the data dir with its ownership
RUN mkdir -p /app/data && chown -R bun:bun /app/data
USER bun

# bun runs the typescript directly, so there is no build step and no dist/
CMD ["bun", "src/index.ts"]
