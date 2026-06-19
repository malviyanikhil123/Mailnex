import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
import { env } from "../config/env.js";
import * as schema from "./schema/index.js";

const { Pool } = pkg;

export const pool = new Pool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USERNAME,
  password: env.DB_PASSWORD,
  database: env.DB_DATABASE,
});

export const db = drizzle(pool, { schema });
export type DB = typeof db;
