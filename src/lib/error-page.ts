// Self-contained HTML error fallback. Must NOT import any app code — if the
// app's module init crashed, this page must still render.

type ErrorPageOptions = {
  status?: number;
  title?: string;
  message?: string;
  requestId?: string;
};

export function renderErrorPage(options: ErrorPageOptions = {}): string {
  const status = options.status ?? 500;
  const title = escapeHtml(
    options.title ?? (status >= 500 ? "We hit a snag loading this page" : "This page didn't load"),
  );
  const message = escapeHtml(
    options.message ??
      "The server couldn't render this page. This is usually temporary — try again in a moment, or head back to the home page. If it keeps happening, please contact support.",
  );
  const requestIdLine = options.requestId
    ? `<p class="meta">Reference: <code>${escapeHtml(options.requestId)}</code></p>`
    : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body { font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; background: #fafafa; color: #0f172a; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 30rem; width: 100%; text-align: center; padding: 2.25rem 1.75rem; background: #fff; border: 1px solid #e5e7eb; border-radius: 0.75rem; box-shadow: 0 1px 2px rgba(0,0,0,0.04); }
      .badge { display: inline-block; font-size: 0.75rem; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; color: #b91c1c; background: #fef2f2; padding: 0.25rem 0.6rem; border-radius: 999px; margin-bottom: 1rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #475569; margin: 0 0 1.25rem; }
      .meta { font-size: 0.8rem; color: #64748b; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #f1f5f9; padding: 0.1rem 0.35rem; border-radius: 0.25rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      button, a.btn { padding: 0.55rem 1.1rem; border-radius: 0.5rem; font: inherit; font-weight: 500; cursor: pointer; text-decoration: none; border: 1px solid transparent; transition: opacity 0.15s; }
      button:hover, a.btn:hover { opacity: 0.9; }
      .primary { background: #0f172a; color: #fff; }
      .secondary { background: #fff; color: #0f172a; border-color: #cbd5e1; }
      @media (prefers-color-scheme: dark) {
        body { background: #0b1220; color: #f1f5f9; }
        .card { background: #111827; border-color: #1f2937; }
        p { color: #94a3b8; }
        .badge { color: #fca5a5; background: rgba(239,68,68,0.12); }
        code { background: #1f2937; }
        .primary { background: #f8fafc; color: #0f172a; }
        .secondary { background: transparent; color: #f1f5f9; border-color: #334155; }
      }
    </style>
  </head>
  <body>
    <main class="card" role="alert" aria-live="assertive">
      <span class="badge">Error ${status}</span>
      <h1>${title}</h1>
      <p>${message}</p>
      ${requestIdLine}
      <div class="actions">
        <button class="primary" onclick="location.reload()">Try again</button>
        <a class="btn secondary" href="/">Go to home</a>
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
