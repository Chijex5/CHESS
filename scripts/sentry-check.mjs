#!/usr/bin/env node
/* ── Confirm an event actually landed, without the MCP ─────────────────────────
   The MCP's only irreplaceable job is reading your Sentry account back to you. That
   is a REST API, so this does the same thing with a token and `fetch`.

   Usage:
     SENTRY_API_TOKEN=… SENTRY_ORG=… SENTRY_PROJECT=… node scripts/sentry-check.mjs

   The token is a *user auth token* from sentry.io/settings/account/api/auth-tokens/
   with `project:read` and `event:read` — not the DSN, and not the build-time
   SENTRY_AUTH_TOKEN, though a token with those scopes works for both.
   ─────────────────────────────────────────────────────────────────────────── */

const token = process.env.SENTRY_API_TOKEN ?? process.env.SENTRY_AUTH_TOKEN;
const org = process.env.SENTRY_ORG;
const project = process.env.SENTRY_PROJECT;

if (!token || !org || !project) {
  console.error(
    "Need SENTRY_API_TOKEN (or SENTRY_AUTH_TOKEN), SENTRY_ORG and SENTRY_PROJECT.\n" +
      "Org and project slugs are in your Sentry project's URL:\n" +
      "  sentry.io/organizations/<ORG>/projects/<PROJECT>/",
  );
  process.exit(2);
}

const url = `https://sentry.io/api/0/projects/${org}/${project}/issues/?statsPeriod=1h&query=`;
const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });

if (!response.ok) {
  console.error(`Sentry API ${response.status}: ${await response.text()}`);
  console.error(
    response.status === 401
      ? "\nThat token was rejected. Check it has project:read and event:read."
      : "",
  );
  process.exit(1);
}

const issues = await response.json();
if (issues.length === 0) {
  console.log("No issues in the last hour. Nothing has arrived yet.");
  process.exit(1);
}

console.log(`${issues.length} issue(s) in the last hour:\n`);
for (const issue of issues) {
  console.log(`  ${issue.title}`);
  if (issue.culprit) console.log(`    culprit : ${issue.culprit}`);
  console.log(`    events  : ${issue.count}   last seen: ${issue.lastSeen}`);
  console.log(`    url     : ${issue.permalink}\n`);
}
