/**
 * QR target URL resolution.
 *
 * Precedence:
 *   1. import.meta.env.VITE_PUBLIC_APP_URL  (set this in .env for demos so
 *      QR codes always point at the published deployment, not the preview)
 *   2. same-origin relative URLs            (SSR-safe fallback for local/dev)
 *
 * Always returns "<base>/e/<token>" with no trailing slash on the base.
 */
export function getPublicAppBaseUrl(): { base: string; source: "env" | "origin" | "none" } {
  const envUrl = (import.meta.env.VITE_PUBLIC_APP_URL as string | undefined)?.trim();
  if (envUrl) return { base: envUrl.replace(/\/+$/, ""), source: "env" };
  return { base: "", source: "origin" };
}

export function buildQrTargetUrl(token: string): string {
  const { base } = getPublicAppBaseUrl();
  return `${base}/e/${token}`;
}
