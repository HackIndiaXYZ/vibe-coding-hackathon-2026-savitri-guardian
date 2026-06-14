# Savitri v1.0 — Live Cross-Role Validation Checklist

Run this checklist against the preview before tagging v1.0. Mark each row
PASS / FAIL with a short note. Do not claim release readiness until every
row is PASS or has an explicit accepted-risk waiver.

## 0. Environment sanity

- [ ] `/debug/env` reports `Has SUPABASE_URL = true` and
      `Has SUPABASE_PUBLISHABLE_KEY = true`.
- [ ] `/emt/scan` (manual mode, demo) shows the expected
      `SUPABASE_PROJECT_ID` and `ENVIRONMENT_ID`.
- [ ] `/login`, `/patient/qr`, `/emt/scan` all load with no
      "Missing Supabase environment variable" banners.

## 1. Patient workflow

- [ ] Sign up as a new patient, verify email gate behaves as configured.
- [ ] Complete medical profile (allergies, blood group, ICE contacts).
- [ ] `/patient/qr` renders a QR; the visible token matches the QR payload.
- [ ] Rotating the token deactivates the previous one (old `/e/:token`
      page no longer reveals profile).
- [ ] SOS (loud) triggers a session, captures location, starts voice
      recording, and notifies contacts.
- [ ] Silent SOS behaves identically but with no audible/visual alert
      on-device.

## 2. Emergency Contact workflow

- [ ] Contact receives the `/n/:token` link.
- [ ] "Current Status" card shows ONLY: severity badge, latest workflow
      status, short AI summary, last-updated timestamp.
- [ ] Timeline section appears separately and does not duplicate the
      status card.
- [ ] Recording block transitions: pending → uploaded → summarized
      without manual refresh.
- [ ] Voice-note playback logs a `CONTACT_VOICE_NOTE_PLAYED` timeline
      entry.

## 3. EMT workflow

- [ ] EMT login lands on `/emt`.
- [ ] `Load Demo Patient` button works in demo mode.
- [ ] `/emt/scan` camera mode scans a real QR and navigates to
      `/emt/session/:id`.
- [ ] `/emt/scan` manual mode accepts a pasted token AND a pasted
      `/e/:token` URL.
- [ ] Successful scan never displays "QR not recognized".
- [ ] EMT can capture voice note, run assessment, and submit a report.
- [ ] Submission produces a `REPORT_SUBMITTED` timeline entry.

## 4. Hospital workflow

- [ ] Hospital queue shows "possible" entries from public scans in
      realtime.
- [ ] Hospital queue shows "confirmed" entries when an EMT submits a
      report, with no manual refresh.
- [ ] Accept / decline updates the incident status and the contact
      page reflects it.
- [ ] Arrival confirmation closes the incident lifecycle.

## 5. QR token lifecycle

- [ ] New token row created with `active = true`.
- [ ] Previous token row flipped to `active = false` on rotation.
- [ ] Inactive token returns the correct "expired / rotated" UX on
      `/e/:token`.
- [ ] `scanEmergencyToken` rejects inactive tokens with a clear error.

## 6. Incident lifecycle

- [ ] `SOS_TRIGGERED` → `EMERGENCY_SESSION_CREATED` → `QR_SCANNED` (EMT)
      → `REPORT_SUBMITTED` → `HOSPITAL_ALERTED` → `HOSPITAL_ACCEPTED`
      → `PATIENT_ARRIVED` all appear in the audit/timeline in order.
- [ ] No duplicated events; no orphan events.

## 7. Cleanup verification (Phase C)

- [ ] `/emt/scan` does NOT show: RETURN_PAYLOAD, stack traces,
      PASTED_TOKEN, NORMALIZED_TOKEN, DB_QUERY_TOKEN, PATIENT_ID,
      "Lookup Flow Trace" panel.
- [ ] Demo diagnostics panel shows ONLY ENVIRONMENT_ID and
      SUPABASE_PROJECT_ID.

## 8. Docs

- [ ] `README.md`, `INCIDENT_LIFECYCLE.md`, `CHANGELOG.md`, and
      `RELEASE_NOTES_v1.0.md` are accurate against the shipped build.

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| QA lead         |  |  |  |
| Product owner   |  |  |  |
| Engineering     |  |  |  |
