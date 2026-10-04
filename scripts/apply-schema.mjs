// Applies schema.sql to DATABASE_URL (Neon). Safe to re-run.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

try { process.loadEnvFile(".env"); } catch {}
if (!process.env.DATABASE_URL) { console.error("Set DATABASE_URL in .env"); process.exit(1); }
const sql = neon(process.env.DATABASE_URL);
const statements = readFileSync(new URL("../schema.sql", import.meta.url), "utf8")
  .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n")
  .split(";").map((s) => s.trim()).filter(Boolean);
for (const s of statements) await sql.query(s);
console.log(`Applied ${statements.length} statements.`);
