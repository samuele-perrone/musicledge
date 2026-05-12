/**
 * One-time script to get a YouTube OAuth2 refresh token.
 * Run: npx ts-node scripts/youtube-auth.ts
 *
 * Then copy YOUTUBE_REFRESH_TOKEN into your .env.local
 */
import { google } from "googleapis";
import * as readline from "readline";

const CLIENT_ID = process.env.YOUTUBE_CLIENT_ID!;
const CLIENT_SECRET = process.env.YOUTUBE_CLIENT_SECRET!;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env.local first");
  process.exit(1);
}

const oauth2 = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, "urn:ietf:wg:oauth:2.0:oob");

const SCOPES = ["https://www.googleapis.com/auth/youtube.upload"];

const authUrl = oauth2.generateAuthUrl({ access_type: "offline", scope: SCOPES });

console.log("\n1. Open this URL in your browser:\n");
console.log(authUrl);
console.log("\n2. Authorize the app, copy the code, paste it below:\n");

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
rl.question("Code: ", async (code) => {
  rl.close();
  const { tokens } = await oauth2.getToken(code.trim());
  console.log("\n✅ Add this to your .env.local:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
});
