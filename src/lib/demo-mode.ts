/**
 * Hackathon-safe Demo Mode. ON by default so judging never fails on a real
 * SMS provider, real geolocation, or a real PSTN call.
 *
 * To flip to production behavior, set VITE_SAVITRI_DEMO_MODE=false at build
 * time. We still keep the constant client-readable so UI badges can render.
 */
export const DEMO_MODE: boolean =
  import.meta.env.VITE_SAVITRI_DEMO_MODE !== "false";

export const DEMO_LOCATION = {
  lat: 28.6129,
  lng: 77.2295,
  label: "India Gate, New Delhi (demo)",
} as const;

export const EMERGENCY_CALL_NUMBER = "112";

/** +91 98765 43210 → +91 XXXXX 3210. Keeps last 4 digits visible. */
export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D+/g, "");
  if (digits.length < 4) return "•".repeat(digits.length);
  const tail = digits.slice(-4);
  const head = phone.startsWith("+") ? `+${digits.slice(0, Math.max(0, digits.length - 4 - 5))}` : "";
  return `${head} XXXXX ${tail}`.trim();
}
