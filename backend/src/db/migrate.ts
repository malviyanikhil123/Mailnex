import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { env } from "../config/env.js";

const { Pool } = pkg;

const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
  max: 1,
});

await migrate(drizzle(pool), { migrationsFolder: "./src/db/migrations" });
await pool.end();
console.log("migrations applied");
