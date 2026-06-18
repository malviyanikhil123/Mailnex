import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "../config/env.js";
const sql = postgres(env.DATABASE_URL, { max: 1 });
await migrate(drizzle(sql), { migrationsFolder: "./src/db/migrations" });
await sql.end();
console.log("migrations applied");
