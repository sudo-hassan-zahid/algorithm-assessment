import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";

import { db, pool } from "../src/db";

async function main() {
  await migrate(db, { migrationsFolder: "drizzle" });
  await pool.end();
  console.log("Database migrations complete.");
}

main().catch(async (error) => {
  console.error(error);
  await pool.end();
  process.exitCode = 1;
});
