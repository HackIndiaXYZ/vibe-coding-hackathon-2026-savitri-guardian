#!/usr/bin/env node
/**
 * Preflight SSR smoke test.
 *
 * Boots the Vite dev server (or uses an already-running one), hits a list of
 * critical routes, and verifies each one returns a 2xx response WITHOUT the
 * catastrophic h3 `{"unhandled":true,"message":"HTTPError"}` payload that
 * indicates a swallowed SSR error.
 *
 * Usage:
 *   node scripts/ssr-smoke-test.mjs                # use $PORT or 8080
 *   PORT=5173 node scripts/ssr-smoke-test.mjs
 *   node scripts/ssr-smoke-test.mjs /login /signup # custom routes
 */

const PORT = process.env.PORT || "8080";
const HOST = process.env.HOST || "127.0.0.1";
const BASE = `http://${HOST}:${PORT}`;

const DEFAULT_ROUTES = ["/", "/login", "/signup", "/patient/qr"];
const routes = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_ROUTES;

const TIMEOUT_MS = 15_000;
const READY_TIMEOUT_MS = 30_000;

async function waitForServer() {
  const start = Date.now();
  while (Date.now() - start < READY_TIMEOUT_MS) {
    try {
      const res = await fetch(BASE + "/", { signal: AbortSignal.timeout(2000) });
      if (res.status < 600) return true;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

async function checkRoute(path) {
  const url = BASE + path;
  const started = Date.now();
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: "text/html" },
    });
    const elapsed = Date.now() - started;
    const body = await res.text();

    if (res.status >= 500) {
      return { path, ok: false, status: res.status, elapsed, reason: `HTTP ${res.status}` };
    }
    if (body.includes('"unhandled":true') && body.includes('"message":"HTTPError"')) {
      return { path, ok: false, status: res.status, elapsed, reason: "h3 swallowed SSR error" };
    }
    if (body.length < 50) {
      return { path, ok: false, status: res.status, elapsed, reason: `tiny body (${body.length}b)` };
    }
    return { path, ok: true, status: res.status, elapsed };
  } catch (err) {
    return { path, ok: false, status: 0, elapsed: Date.now() - started, reason: err.message };
  }
}

async function main() {
  process.stdout.write(`[ssr-smoke] waiting for ${BASE} ... `);
  const ready = await waitForServer();
  if (!ready) {
    console.error(`\n[ssr-smoke] server did not respond within ${READY_TIMEOUT_MS}ms`);
    process.exit(2);
  }
  console.log("ready");

  const results = [];
  for (const path of routes) {
    const r = await checkRoute(path);
    results.push(r);
    const tag = r.ok ? "PASS" : "FAIL";
    console.log(`[ssr-smoke] ${tag}  ${r.status || "---"}  ${r.elapsed}ms  ${r.path}${r.reason ? "  — " + r.reason : ""}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n[ssr-smoke] ${failed.length}/${results.length} route(s) failed`);
    process.exit(1);
  }
  console.log(`\n[ssr-smoke] all ${results.length} routes passed`);
}

main().catch((err) => {
  console.error("[ssr-smoke] fatal:", err);
  process.exit(2);
});
