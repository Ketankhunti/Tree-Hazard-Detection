/**
 * Connection diagnostic: `npm run db:check`.
 *
 * Run this before the seeder. Supabase has two failure modes that produce
 * confusing errors elsewhere in the app, and this names both of them directly.
 */

import { Client } from "pg";

import { connectionSettings } from "@/backend/db/client";

const RESET = "\x1b[0m";
const RED = "\x1b[31m";
const GREEN = "\x1b[32m";
const DIM = "\x1b[2m";

function explain(error: NodeJS.ErrnoException): string[] {
  const code = error.code ?? "";

  if (code === "ENETUNREACH" || code === "EHOSTUNREACH") {
    return [
      "The database host resolved, but this machine could not reach it.",
      "",
      "Supabase's DIRECT host (db.<ref>.supabase.co) is IPv6-only on current",
      "projects. If your network is IPv4-only - most home and office networks,",
      "and most CI runners - it is unreachable no matter what the password is.",
      "",
      "Fix: use the SESSION POOLER connection string instead. It is IPv4.",
      "  Supabase Dashboard -> Project Settings -> Database",
      "  -> Connection string -> URI -> Session pooler",
      "",
      "It looks like:",
      "  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require",
    ];
  }

  if (code === "ETIMEDOUT") {
    return [
      "Connection timed out. Usually a firewall blocking outbound 5432, or the",
      "IPv6 issue above. Try the Session pooler connection string.",
    ];
  }

  if (error.message.includes("password authentication failed")) {
    return [
      "The host accepted the connection but rejected the credentials.",
      "",
      "Check the password, and remember to URL-encode special characters:",
      "  @ -> %40    # -> %23    / -> %2F    : -> %3A    ? -> %3F",
      "",
      "You can reset it: Project Settings -> Database -> Reset database password.",
    ];
  }

  if (code === "ENOTFOUND") {
    return [
      "The hostname did not resolve from this machine.",
      "",
      "If the host is db.<ref>.supabase.co, this is almost certainly the IPv6",
      "problem: Supabase publishes only an AAAA record for the direct host, so",
      "a machine without IPv6 cannot resolve it at all. The password is not the",
      "issue.",
      "",
      "Fix: use the SESSION POOLER connection string, which is IPv4.",
    ];
  }

  if (error.message.includes("self-signed") || error.message.includes("certificate")) {
    return [
      "TLS verification failed. Set DATABASE_SSL_STRICT=false (the default)",
      "unless you have installed Supabase's CA certificate.",
    ];
  }

  return ["Unrecognised failure. The raw error is above."];
}

/** Every AWS region Supabase runs poolers in, most common first. */
const POOLER_REGIONS = [
  "us-east-1",
  "us-west-1",
  "us-east-2",
  "us-west-2",
  "ap-south-1",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "ap-northeast-2",
  "eu-central-1",
  "eu-central-2",
  "eu-west-1",
  "eu-west-2",
  "eu-west-3",
  "eu-north-1",
  "ca-central-1",
  "sa-east-1",
];

/**
 * Finds the Session pooler endpoint for a project.
 *
 * Every region shares one DNS name per pooler, so DNS alone cannot identify
 * the right one - only an authenticated connection can. Each region is tried
 * in parallel with a short timeout; the wrong region rejects the tenant
 * immediately rather than hanging.
 */
async function findPooler(
  ref: string,
  password: string
): Promise<string | null> {
  console.log(
    `\n${DIM}Direct host unreachable. Probing Session pooler regions...${RESET}`
  );

  // Supabase has used two pooler host prefixes; newer projects are on aws-1.
  const hosts = POOLER_REGIONS.flatMap((region) => [
    `aws-0-${region}.pooler.supabase.com`,
    `aws-1-${region}.pooler.supabase.com`,
  ]);

  const failures = new Map<string, string>();

  const attempts = hosts.map(async (host) => {
    const url =
      `postgresql://postgres.${ref}:${encodeURIComponent(password)}` +
      `@${host}:5432/postgres`;

    const probe = new Client({
      connectionString: url,
      ssl: { rejectUnauthorized: process.env.DATABASE_SSL_STRICT === "true" },
      connectionTimeoutMillis: 8000,
    });

    try {
      await probe.connect();
      await probe.query("select 1");
      await probe.end();
      return { host, url };
    } catch (error) {
      await probe.end().catch(() => {});
      failures.set(host, (error as Error).message);
      throw error;
    }
  });

  const results = await Promise.allSettled(attempts);
  for (const result of results) {
    if (result.status === "fulfilled") {
      console.log(`${GREEN}Found it:${RESET} ${result.value.host}`);
      return result.value.url;
    }
  }

  console.log(`${RED}No pooler endpoint accepted these credentials.${RESET}`);

  // "Tenant or user not found" on every host means the ref/password pair is
  // wrong, not the region. Distinguishing that from a network failure saves
  // guessing, so show what the endpoints actually said.
  const distinct = new Map<string, number>();
  for (const message of failures.values()) {
    distinct.set(message, (distinct.get(message) ?? 0) + 1);
  }
  console.log(`\n${DIM}What the endpoints returned:${RESET}`);
  for (const [message, count] of [...distinct].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(2)}x  ${message}`);
  }
  return null;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error(`${RED}DATABASE_URL is not set.${RESET}`);
    console.error(
      `\nCopy .env.example to .env.local and paste your Supabase connection string.`
    );
    process.exit(1);
  }

  const parsed = new URL(url);
  const isDirect = parsed.hostname.startsWith("db.");
  console.log(`host     ${parsed.hostname}:${parsed.port || 5432}`);
  console.log(`user     ${parsed.username}`);
  console.log(
    `mode     ${isDirect ? "direct (IPv6-only on current Supabase projects)" : "pooler"}`
  );

  // Same settings the app uses, including the sslmode strip.
  const settings = connectionSettings();
  const client = new Client({
    connectionString: settings.connectionString,
    ssl: settings.ssl,
    connectionTimeoutMillis: 15_000,
  });

  try {
    await client.connect();
    const meta = await client.query<{ version: string; db: string }>(
      "SELECT version() AS version, current_database() AS db"
    );
    console.log(`\n${GREEN}CONNECTED${RESET}`);
    console.log(`  ${meta.rows[0].version.split(",")[0]}`);
    console.log(`  database: ${meta.rows[0].db}`);

    const tables = await client.query<{ table_name: string; n: string }>(
      `SELECT c.relname AS table_name, COALESCE(s.n_live_tup, 0)::text AS n
         FROM pg_class c
         JOIN pg_namespace ns ON ns.oid = c.relnamespace
         LEFT JOIN pg_stat_user_tables s ON s.relid = c.oid
        WHERE ns.nspname = 'public' AND c.relkind = 'r'
        ORDER BY c.relname`
    );

    if (tables.rows.length === 0) {
      console.log(
        `\n${DIM}No tables yet. Run "npm run db:reset" to create the schema and seed.${RESET}`
      );
    } else {
      console.log("\ntables:");
      for (const row of tables.rows) {
        console.log(`  ${row.table_name.padEnd(16)} ~${row.n} rows`);
      }
    }

    await client.end();
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    console.error(`\n${RED}FAILED${RESET}  ${err.code ?? ""} ${err.message}`);
    console.error("");
    for (const line of explain(err)) console.error(line);
    await client.end().catch(() => {});

    // An unreachable direct host is recoverable: the pooler serves the same
    // database over IPv4, so find it rather than making the user hunt for it.
    const unreachable =
      err.code === "ENOTFOUND" ||
      err.code === "ENETUNREACH" ||
      err.code === "EHOSTUNREACH" ||
      err.code === "ETIMEDOUT";

    if (unreachable && isDirect) {
      const ref = parsed.hostname
        .replace(/^db\./, "")
        .replace(/\.supabase\.co$/, "");
      const working = await findPooler(ref, decodeURIComponent(parsed.password));
      if (working) {
        const fs = await import("node:fs");
        fs.writeFileSync(".env.local.suggested", `DATABASE_URL=${working}\n`);
        console.log("\nWorking connection string (password masked):\n");
        console.log("  " + working.replace(/:[^:@]+@/, ":********@"));
        console.log(
          `\n${DIM}Full string written to .env.local.suggested - copy the` +
            ` DATABASE_URL line into .env.local.${RESET}`
        );
      }
    }

    process.exit(1);
  }
}

main();
