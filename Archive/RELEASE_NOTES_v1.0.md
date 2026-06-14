# Savitri Emergency Workflow — v1.0 Release Notes

**Release date:** 2026-06-01
**Codename:** Savitri Emergency Workflow v1.0

This is the first end-to-end release of Savitri Guardian. It closes the
loop between patient, emergency contact, EMT, and hospital around a single
QR-driven incident.

## Highlights

- Four production workflows (Patient, Emergency Contact, EMT, Hospital)
  wired through one shared incident lifecycle.
- Rotating QR token with a stable, auditable lifecycle.
- AI-assisted handoff brief generated from EMT voice notes.
- Realtime updates to hospital queues and emergency-contact pages.

## Key fixes in this release

1. **EMT QR validation repair** — `scanEmergencyToken` previously used a
   PostgREST embed (`select("*, patient:patient_id(*)")`) on
   `emergency_tokens`. The FK to the profile table was not registered in
   PostgREST's schema cache, so the embed silently failed and returned
   `null`. The EMT UI then surfaced the generic "QR not recognized" error
   even though the token was valid and active. The server function now
   selects plain columns and resolves the patient in a second query.

2. **Emergency Contact status card redesign** — the "Current Status" card
   now contains only the severity badge, latest workflow status, a short
   AI-generated summary, and a "last updated" timestamp. Timeline history
   was removed from the card; the timeline remains as its own section.

3. **Hospital report listening workflow** — the hospital queue now
   reliably picks up `REPORT_SUBMITTED` events through the realtime
   channel without a manual refresh.

4. **Demo emergency contact login** — a guided demo entry point lets a
   reviewer act as an emergency contact and walk through the full lifecycle
   in one session.

5. **Token lifecycle stabilization** — generation, QR payload, displayed
   token, and DB row are guaranteed consistent; rotation deactivates the
   previous row.

6. **Improved QR diagnostics** — demo-mode `traceEmergencyToken` server
   function returns `EXACT_MATCH_FOUND`, `ACTIVE_STATUS`,
   `ENVIRONMENT_ID`, and `SUPABASE_PROJECT_ID` so a reviewer can confirm
   which backend a preview is connected to.

## Removed (debug artifacts)

From `/emt/scan`:

- `RETURN_PAYLOAD` block
- stack-trace display
- `PASTED_TOKEN`, `NORMALIZED_TOKEN`, `DB_QUERY_TOKEN`, `PATIENT_ID` rows
- "Lookup Flow Trace" panel

Kept in demo mode: `ENVIRONMENT_ID`, `SUPABASE_PROJECT_ID`, and the
`Load Demo Patient` action on the EMT home screen.

## Known risks before release

- End-to-end cross-role validation has not been re-executed against this
  build; see `VALIDATION_CHECKLIST.md`.
- `/debug/env` and `traceEmergencyToken` ship in this build (gated by
  `DEMO_MODE`). Decide before v1.0.1 whether to remove them.
- Realtime delivery to hospital and contact pages depends on the Supabase
  realtime publication staying in sync after migrations.

## Upgrade notes

No data migration required. No env var changes.

## v1.0 release-candidate cleanup (2026-06-01)

Removed pre-release debugging surfaces:

- **`/debug/env` route** (`src/routes/debug.env.tsx`) — deleted.
- **`getDebugEnv` server function** (`src/lib/debug-env.functions.ts`) — deleted.
- **`traceEmergencyToken` server function** — removed from
  `src/lib/emt.functions.ts`. The regression it guarded against is now
  covered by `tests/scanEmergencyToken.test.ts` (16 tests).
- **Manual-scan diagnostics panel** (`src/routes/emt/scan.tsx`) no longer
  calls a server function. In `DEMO_MODE` it still surfaces
  `ENVIRONMENT_ID` and `SUPABASE_PROJECT_ID`, derived from client-safe
  build-time env vars (`import.meta.env.MODE`,
  `VITE_SUPABASE_PROJECT_ID`, `VITE_SUPABASE_URL`).

Kept demo-mode surfaces:

- **Load Demo Patient** action on `/emt` (unchanged).
- **Minimal DEMO_MODE diagnostics panel** on `/emt/scan` showing only
  `ENVIRONMENT_ID` and `SUPABASE_PROJECT_ID`.

### Archived QR debugging findings

| Finding | Status |
|---|---|
| PostgREST embed `select("*, patient:patient_id(*)")` returned null | Fixed — plain-column select |
| Camera path and manual path normalized differently | Verified equal (test 6) |
| Trailing whitespace / quotes / zero-width chars broke matches | Normalizer strips them (test 4) |
| `/e/<token>` URL vs raw token | Both extract identically (test 4) |
| Inactive tokens reported as "QR not recognized" with no reason | Now returns `revoked: true` flag |
| No automated regression coverage existed | 16 vitest cases added |
