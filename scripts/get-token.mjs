// One-time: sign in as the demo Gmail and print GOOGLE_REFRESH_TOKEN.
// Needs GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env (OAuth client type: Desktop app,
// which allows the loopback redirect below without registering it).
import http from "node:http";
import { auth } from "@googleapis/gmail";

try { process.loadEnvFile(".env"); } catch {}
const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = process.env;
if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}
const PORT = 3999;
const redirect = `http://127.0.0.1:${PORT}`;
const client = new auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirect);
const url = client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
});

http.createServer(async (req, res) => {
  const code = new URL(req.url, redirect).searchParams.get("code");
  if (!code) { res.end("waiting for Google..."); return; }
  try {
    const { tokens } = await client.getToken(code);
    res.end("Done. Return to the terminal.");
    console.log("\nAdd this to .env and Vercel:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}\n`);
    if (!tokens.refresh_token) console.log("No refresh token returned: remove the app's access at myaccount.google.com/permissions and retry.");
  } catch (e) {
    res.end("Token exchange failed, see terminal.");
    console.error(e);
  }
  process.exit(0);
}).listen(PORT, () => {
  console.log("Open this URL, sign in as the DEMO Gmail (a test user), accept the unverified-app warning:\n");
  console.log(url);
});
