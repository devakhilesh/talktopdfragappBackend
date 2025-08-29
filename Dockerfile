# ─── STAGE 1: Build ───────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# 1. Copy package files & install all deps
COPY package.json package-lock.json ./
RUN npm ci

# 2. Copy source and compile
COPY tsconfig.json ./
COPY server.ts ./
COPY src ./src

# # Copy public so it will be picked up in final image
# COPY public ./public
RUN npx tsc

# ─── STAGE 2: Production ────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

# 1. Copy only prod deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. Copy compiled output
COPY --from=builder /app/dist ./dist

# 3. (Optional) Copy entrypoint .env if you truly want to bake it in.
#    But in most workflows you’ll use `--env-file` at `docker run` time instead.
# COPY .env ./

ENV PORT=3001
EXPOSE 3001

CMD ["node", "dist/server.js"]
