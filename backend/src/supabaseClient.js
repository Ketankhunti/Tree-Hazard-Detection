import fs from "node:fs";
import path from "node:path";

// Load .env (zero-dependency env loader — runs before client init)
try {
  const envPath = path.join(process.cwd(), ".env");
  const envContent = fs.readFileSync(envPath, "utf-8");
  for (const line of envContent.split(/\r?\n/)) {
    const match = line.match(/^([A-Z_]+)=(.*)$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2].trim();
    }
  }
} catch {}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_PUBLISHABLE_KEY;

let client = null;

if (supabaseUrl && supabaseKey) {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    client = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  } catch (err) {
    console.warn("Supabase initialization skipped or package not installed:", err.message);
  }
} else {
  console.info("ℹ Supabase credentials not set — using in-memory storage fallback.");
}

export const supabase = client;
