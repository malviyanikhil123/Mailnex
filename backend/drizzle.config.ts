import { defineConfig } from "drizzle-kit";
export default defineConfig({
  // drizzle-kit v0.24 runs as CJS and cannot resolve .js barrel re-exports; use glob directly instead of "./src/db/schema/index.ts"
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
