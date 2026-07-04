import "dotenv/config";
import { Client } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const timeoutMs = 30_000;
const retryDelayMs = 1_000;
const startedAt = Date.now();

async function canConnect() {
  const client = new Client({ connectionString: databaseUrl });
  try {
    await client.connect();
    await client.query("SELECT 1");
    return true;
  } finally {
    await client.end().catch(() => undefined);
  }
}

async function main() {
  while (Date.now() - startedAt < timeoutMs) {
    try {
      if (await canConnect()) {
        console.log("Database is ready.");
        return;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown database error";
      console.log(`Waiting for database: ${message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
  }

  throw new Error("Timed out waiting for the database to accept connections.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
