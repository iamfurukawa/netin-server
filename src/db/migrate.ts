import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { readEnvironment } from "../config.js";
import type { Environment } from "../config.js";
import { createDatabase } from "./client.js";

export async function runMigrations(environment: Environment = readEnvironment()) {
  const database = createDatabase(environment);
  try {
    await migrate(database.db, { migrationsFolder: resolve(process.cwd(), "drizzle") });
  } finally {
    await database.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void runMigrations().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
