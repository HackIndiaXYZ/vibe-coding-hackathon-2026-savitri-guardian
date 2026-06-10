import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const UNAUTH_PATTERNS = [
  /unauthorized/i,
  /\b401\b/,
  /no authorization header/i,
  /invalid token/i,
  /jwt expired/i,
];

export function isUnauthorizedError(err: unknown): boolean {
  if (!err) return false;
  const msg =
    typeof err === "string"
      ? err
      : (err as { message?: string })?.message ?? String(err);
  return UNAUTH_PATTERNS.some((re) => re.test(msg));
}

let recovering = false;

/** Sign out and redirect to /login. Idempotent across rapid failures. */
export async function recoverFromUnauthorized(reason?: string) {
  if (recovering) return;
  recovering = true;
  try {
    try {
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
    if (typeof window !== "undefined") {
      toast.error(reason || "Session expired. Please sign in again.");
      if (!window.location.pathname.startsWith("/login")) {
        const redirect = encodeURIComponent(
          window.location.pathname + window.location.search,
        );
        window.location.replace(`/login?redirect=${redirect}`);
      }
    }
  } finally {
    // Reset after navigation kicks in
    setTimeout(() => {
      recovering = false;
    }, 2000);
  }
}
