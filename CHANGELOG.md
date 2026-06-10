# Changelog

All notable changes to Savitri Guardian are recorded here. Format loosely
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
project uses semantic versioning.

## [1.0.0] — 2026-06-01 — Savitri Emergency Workflow v1.0

First end-to-end release covering the patient, emergency contact, EMT, and
hospital workflows around a single QR-driven incident lifecycle.

### Added
- **Patient workflow** — signup, medical profile, rotating QR token, SOS
  trigger (loud + silent), live session view.
- **Emergency Contact workflow** — tokenized notification link (no login),
  redesigned "Current Status" card (severity badge, latest workflow status,
  short AI summary, last updated), live polling for recording + AI summary,
  read-only timeline.
- **EMT workflow** — camera + manual QR scan, emergency session creation,
  voice note capture, structured assessment, hospital handoff.
- **Hospital workflow** — live incident queue (possible / confirmed),
  accept / decline, arrival confirmation, AI-generated handoff brief.
- **Demo emergency contact login** for cross-role walkthroughs.
- **Demo diagnostics panel** on `/emt/scan` showing `ENVIRONMENT_ID` and
  `SUPABASE_PROJECT_ID` only (all verbose trace artifacts removed).

### Fixed
- **EMT QR validation repair.** `scanEmergencyToken` no longer uses a
  PostgREST embed against `emergency_tokens` (the FK was not in the schema
  cache, which caused the query to return `null` and the UI to display
  "QR not recognized" even on a perfectly valid, active token). The server
  function now selects plain columns and resolves the patient in a second
  query.
- **Token lifecycle stabilization.** Generation, display, and DB row are
  guaranteed consistent; only the active token is accepted; rotation
  deactivates the previous row in the same transaction.
- **Improved QR diagnostics.** Demo-mode `traceEmergencyToken` server
  function returns environment + project ref so we can prove which
  backend a preview is hitting without leaking PII.
- **Hospital report listening workflow.** Realtime subscription now picks
  up `REPORT_SUBMITTED` events without a manual refresh.

### Changed
- Emergency Contact "Current Status" card no longer duplicates the
  timeline below it — the timeline is its own section.
- Removed temporary debug surface from `/emt/scan`: `RETURN_PAYLOAD`,
  stack trace, `PASTED_TOKEN`, `NORMALIZED_TOKEN`, `DB_QUERY_TOKEN`,
  `PATIENT_ID`, and the "Lookup Flow Trace" panel are gone.

### Security
- All public-token endpoints (`/n/:token`, `/e/:token`) remain read-only
  and scope to a single incident.
- RLS unchanged; admin client only used by server functions.
