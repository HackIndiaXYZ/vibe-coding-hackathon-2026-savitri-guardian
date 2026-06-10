import { useEffect } from "react";
import { useRouter } from "@tanstack/react-router";
import { reportLovableError } from "@/lib/lovable-error-reporting";

type Props = {
  error: Error;
  reset: () => void;
  boundary?: string;
  title?: string;
};

/**
 * Consistent in-app error UI. Mirrors the SSR HTML fallback in
 * `src/lib/error-page.ts` so users see the same look whether the
 * failure happens server-side or client-side. Always offers a retry.
 */
export function GlobalErrorFallback({ error, reset, boundary = "root", title }: Props) {
  const router = useRouter();

  useEffect(() => {
    reportLovableError(error, { boundary });
  }, [error, boundary]);

  const handleRetry = () => {
    void router.invalidate();
    reset();
  };

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="flex min-h-screen items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center shadow-sm">
        <span className="mb-4 inline-block rounded-full bg-destructive/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-destructive">
          Something went wrong
        </span>
        <h1 className="text-xl font-semibold text-foreground">
          {title ?? "We hit a snag loading this page"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This is usually temporary — try again in a moment, or head back to the home page.
        </p>
        {error?.message ? (
          <p className="mt-3 break-words text-xs text-muted-foreground/80">
            <code className="rounded bg-muted px-1.5 py-0.5">{error.message}</code>
          </p>
        ) : null}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition hover:bg-muted"
          >
            Go to home
          </a>
        </div>
      </div>
    </div>
  );
}
