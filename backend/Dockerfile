# ---- Build stage ----
FROM node:22-alpine AS builder
WORKDIR /app

# Install all deps (incl. dev) for the TypeScript build
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript → dist
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Production dependencies only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Compiled output + the SQL migrations (migrate.js reads ./src/db/migrations)
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src/db/migrations ./src/db/migrations

# Persisted uploads (resume + import temp files)
RUN mkdir -p /app/uploads
ENV UPLOAD_DIR=/app/uploads

EXPOSE 4000

# Apply migrations, seed (idempotent), then start the server.
CMD ["sh", "-c", "node dist/db/migrate.js && node dist/db/seed/seed.js && node dist/server.js"]
