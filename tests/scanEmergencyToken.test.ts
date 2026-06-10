/**
 * QR Scan Regression Tests — Savitri Emergency Workflow
 *
 * ──────────────────────────────────────────────────────────────────────────
 * PRODUCTION INCIDENT (May 2026) — DO NOT DELETE THIS COMMENT
 * ──────────────────────────────────────────────────────────────────────────
 * Symptoms in production:
 *   - Exact token match existed in `emergency_tokens`
 *   - Row had `active = true`
 *   - Linked patient existed
 *   - EMT scan UI showed: "QR not recognized"
 *
 * Root cause:
 *   scanEmergencyToken() used a PostgREST embed query:
 *       .select("*, patient:patient_id(*)")
 *   on `emergency_tokens`. No foreign-key relationship from
 *   emergency_tokens.patient_id to profiles is declared in PostgREST's
 *   schema cache, so the embed silently errored and returned `data = null`,
 *   which caused `tok = null` and a "QR not recognized" return — even
 *   though the token was valid and active.
 *
 * Resolution:
 *   - Replaced embed query with plain-column `.select("id, token, active,
 *     patient_id")`.
 *   - Patient profile is fetched in a SEPARATE query.
 *
 * These tests exist so that anyone who reintroduces an embed query, breaks
 * token normalization, or regresses inactive/missing-token handling gets a
 * red CI immediately.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { findActiveTokenRow, normalizeTokenInput } from "../src/lib/emt.functions";

// Tiny in-memory chainable fake mirroring the supabase-js select() chain
// shape (.from().select().eq().eq().maybeSingle()).
function makeFakeClient(
  handler: (table: string, filters: Record<string, unknown>) => { data: any; error: any },
) {
  return {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      const chain: any = {
        select: (_cols: string) => chain,
        eq: (col: string, val: unknown) => {
          filters[col] = val;
          return chain;
        },
        maybeSingle: async () => handler(table, filters),
      };
      return chain;
    },
  };
}

// ─── TEST 4 ────────────────────────────────────────────────────────────────
describe("normalizeTokenInput — token normalization", () => {
  const TOKEN = "abcdef1234567890";

  it.each([
    ["raw token", TOKEN],
    ["leading/trailing whitespace", `  ${TOKEN}  `],
    ["leading/trailing quotes", `"${TOKEN}"`],
    ["zero-width chars", `\u200B${TOKEN}\uFEFF`],
    ["trailing query string", `${TOKEN}?utm=test`],
    ["trailing fragment", `${TOKEN}#anchor`],
    ["/e/<token> path", `/e/${TOKEN}`],
    ["full URL", `https://savitri-health.lovable.app/e/${TOKEN}`],
    ["full URL with query", `https://savitri-health.lovable.app/e/${TOKEN}?ref=qr`],
  ])("normalizes %s → bare token", (_label, input) => {
    expect(normalizeTokenInput(input)).toBe(TOKEN);
  });
});

// ─── TEST 6 ────────────────────────────────────────────────────────────────
describe("Camera path == Manual path", () => {
  // Replicates the extractToken() in src/routes/emt/scan.tsx so we catch
  // drift between the camera/manual entry point and the server validator.
  const extractToken = (raw: string) => {
    const cleaned = raw
      .replace(/[\u200B-\u200D\uFEFF]/g, "")
      .replace(/^["'`\s]+|["'`\s]+$/g, "")
      .trim();
    const mm = cleaned.match(/\/e\/([A-Za-z0-9]+)/);
    return (mm ? mm[1] : cleaned.replace(/[?#].*$/, "")).trim();
  };

  it("camera-decoded URL and pasted token produce the same normalized value", () => {
    const TOKEN = "deadbeefcafefeed12345678";
    const cameraInput = `https://savitri-health.lovable.app/e/${TOKEN}`;
    const manualInput = `  ${TOKEN}  `;
    expect(extractToken(cameraInput)).toBe(normalizeTokenInput(manualInput));
  });
});

// ─── TESTS 1 / 2 / 3 ──────────────────────────────────────────────────────
describe("findActiveTokenRow — DB lookup contract", () => {
  // TEST 1: Valid active token
  it("returns the active token row with patient_id when token exists and is active", async () => {
    const row = {
      id: "tok-1",
      token: "active-token",
      active: true,
      patient_id: "patient-1",
    };
    const client = makeFakeClient((table, filters) => {
      expect(table).toBe("emergency_tokens");
      if (filters.active === true) return { data: row, error: null };
      return { data: null, error: null };
    });

    const res = await findActiveTokenRow(client, "active-token");
    expect(res.tok).toEqual(row);
    expect(res.tok?.patient_id).toBe("patient-1");
    expect(res.inactiveExisted).toBe(false);
  });

  // TEST 2: Inactive token
  it("returns null tok + inactiveExisted=true when token exists but active=false", async () => {
    const client = makeFakeClient((_table, filters) => {
      if (filters.active === true) return { data: null, error: null };
      return { data: { id: "tok-2", active: false }, error: null };
    });
    const res = await findActiveTokenRow(client, "inactive-token");
    expect(res.tok).toBeNull();
    expect(res.inactiveExisted).toBe(true);
  });

  // TEST 3: Nonexistent token
  it("returns null tok + inactiveExisted=false when token does not exist", async () => {
    const client = makeFakeClient(() => ({ data: null, error: null }));
    const res = await findActiveTokenRow(client, "nope");
    expect(res.tok).toBeNull();
    expect(res.inactiveExisted).toBe(false);
  });

  // TEST 5: explicit no-embed-relationship guard at runtime.
  it("does not request an embedded `patient:patient_id(*)` relationship", async () => {
    const selectSpy = vi.fn(() => ({
      eq: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        maybeSingle: async () => ({ data: null, error: null }),
      }),
    }));
    const client = { from: () => ({ select: selectSpy }) } as any;
    await findActiveTokenRow(client, "anything");
    for (const call of selectSpy.mock.calls) {
      const cols = String(call[0] ?? "");
      expect(cols).not.toMatch(/patient\s*:/);
      expect(cols).not.toMatch(/\(\s*\*\s*\)/);
    }
  });
});

// ─── TESTS 5 / 7 — Source-code regression guard ───────────────────────────
describe("Source-code regression guard — no PostgREST embeds on emergency_tokens", () => {
  const src = readFileSync(
    resolve(__dirname, "../src/lib/emt.functions.ts"),
    "utf8",
  );

  // Strip line and block comments so the REGRESSION NOTE example doesn't
  // false-positive the guard.
  const codeOnly = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  it("emt.functions.ts never embeds patient via PostgREST relationship", () => {
    expect(codeOnly).not.toMatch(/from\(["']emergency_tokens["']\)[\s\S]{0,200}patient\s*:/);
    expect(codeOnly).not.toMatch(/select\(\s*["']\*\s*,\s*patient/);
  });

  it("retains the incident comment so the rationale is not silently deleted", () => {
    expect(src).toMatch(/REGRESSION NOTE/);
    expect(src).toMatch(/PostgREST embed/i);
  });
});
