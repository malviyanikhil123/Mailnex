import { defineConfig } from "drizzle-kit";
export default defineConfig({
  // drizzle-kit v0.24 runs as CJS and cannot resolve .js barrel re-exports; use glob directly instead of "./src/db/schema/index.ts"
  schema: "./src/db/schema/*.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    host: process.env.DB_HOST!,
    port: Number(process.env.DB_PORT ?? 5432),
    user: process.env.DB_USERNAME!,
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_DATABASE!,
    ssl: false,
  },
});
