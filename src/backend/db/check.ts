/**
 * Supabase REST API health check: `npm run db:check`.
 *
 * Verifies that the Supabase REST endpoint is reachable and the expected
 * tables exist, by hitting the PostgREST endpoint with the configured API key.
 */

import { supabaseUrl, supabaseKey, supabaseFetch } from "@/backend/db/client";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";

async function main(): Promise<void> {
  const url = supabaseUrl();
  const key = supabaseKey();

  console.log(`endpoint  ${url}/rest/v1`);
  console.log(`key       ${key.slice(0, 12)}...${key.slice(-4)}`);

  try {
    // Try fetching a single row from requests to verify connectivity + auth
    const rows = await supabaseFetch<{ id: string }[]>("requests", "GET", undefined, {
      select: "id",
      limit: 1,
    });

    console.log(`\n${GREEN}CONNECTED${RESET}`);
    console.log(`  requests table accessible (${rows?.length ?? 0} row sampled)`);

    // Check all expected tables
    const tables = ["requests", "images", "assessments", "status_history", "feedback"];
    console.log("\ntables:");
    for (const table of tables) {
      try {
        const sample = await supabaseFetch<{ id: unknown }[]>(table, "GET", undefined, {
          select: "id",
          limit: 1,
        });
        console.log(`  ${table.padEnd(16)} ${GREEN}OK${RESET} (${sample?.length ?? 0} rows sampled)`);
      } catch (err) {
        console.log(`  ${table.padEnd(16)} ${RED}FAILED${RESET} - ${(err as Error).message}`);
      }
    }
  } catch (error) {
    console.error(`\n${RED}FAILED${RESET}  ${(error as Error).message}`);
    console.error("");
    console.error("Check that VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY");
    console.error("are set correctly in .env.local");
    process.exit(1);
  }
}

main();
