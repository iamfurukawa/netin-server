import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import type { Environment } from "../config.js";
import * as schema from "./schema.js";

export function createDatabase(environment: Environment) {
  const pool = new Pool({ connectionString: environment.DATABASE_URL });
  return {
    db: drizzle({ client: pool, schema }),
    close: () => pool.end(),
  };
}

export type DatabaseConnection = ReturnType<typeof createDatabase>;
export type Database = DatabaseConnection["db"];
