# Savitri Guardian — Demo Script

**Official demonstration script for hackathon judges, recruiters, product leaders, and healthcare stakeholders.**

- **Target duration:** 3–5 minutes
- **Format:** Two phones (Patient + Public Scanner) + laptop (Hospital + EMT + Emergency Contact tabs)
- **Environment:** Demo Mode enabled, published URL only

---

## Section 1 — Opening Hook *(0:00 – 0:30)*

> **"Imagine you find an unconscious person on the road."**

You don't know:

- **Who they are** — no identity
- **What's wrong with them** — no medical history, no allergies, no conditions
- **Who to call** — no family contact
- **Where to take them** — no hospital coordination

Today, this scenario costs lives in the first 10 minutes — the window that decides survival.

> **"Savitri Guardian turns any bystander with a phone into the first link in the chain of survival, and connects them to EMTs, hospitals, and family in a single coordinated workflow."**

---

## Section 2 — Patient Setup *(0:30 – 0:50)*

**Show on Phone 1 (Patient app):**

1. **Medical Profile** — blood group, allergies, conditions, insurance.
2. **Emergency Contacts** — name, relation, phone, each with a private notification token.
3. **QR Identity** — the patient's QR card, ready to print, save, or share.

> **"The QR is a rotating token. Scanning it alone reveals nothing — every disclosure is gated by an emergency declaration and written to an audit log."**

---

## Section 3 — Public Scanner Workflow *(0:50 – 1:35)*

**Use Phone 2 (no account, just a camera).**

1. **Scan the QR** → land on `/e/:token`. The page shows only "Emergency? Tap to continue."
2. **Declare the emergency** → the scanner must explicitly confirm this is an emergency.
3. **Identify yourself** → name + contact. Recorded with the report.
4. **Tiered medical info appears** — only first-response fields (ICE contacts, blood group, allergies, critical conditions).
5. **A Possible Emergency report is created** and routed to the nearest hospital dashboard.

> **"No medical information is disclosed without an emergency declaration and an audit trail. `QR_SCANNED`, `PUBLIC_EMERGENCY_REPORTED`, and `MEDICAL_INFO_DISCLOSED` are all logged before a single clinical field is shown."**

---

## Section 4 — Hospital Workflow *(1:35 – 2:20)*

**Switch to the laptop — Hospital Dashboard tab.**

1. **Possible Emergencies queue** updates in real time via Supabase Realtime.
2. Open the new report — show **scanner identity, location, and the tiered patient info**.
3. **Assign an EMT** from the dispatch list → `EMT_ASSIGNED` audit row written; EMT receives it in their queue.
4. One-tap actions: **Call scanner**, **Call patient**, **Call emergency contact** — all numbers surfaced in one place.

> **"Hospitals get clinical visibility before an ambulance is even dispatched. They can triage, assign, or dismiss as a false alarm — every decision is auditable."**

---

## Section 5 — EMT Workflow *(2:20 – 3:20)*

**Switch to the EMT tab.**

1. **Assigned case** appears in the EMT queue with patient name and location.
2. Open it → **patient medical profile** plus the **patient's SOS voice note** (if Path A).
3. Tap **Record assessment** → speak observations (10–15 sec is enough for the demo).
4. **AI summary generation** — Gemini 2.5 Flash via the Lovable AI Gateway transcribes and structures the recording into priority, incident type, observations, and recommended department.
5. **Review modal** opens with the structured summary editable by the EMT.
6. Tap **Submit to hospital** → an **Incident** row is created, `REPORT_SUBMITTED` and `HOSPITAL_ALERTED` audit rows fire, and the hospital sees it as a Confirmed Incident immediately.

> **"The hospital receives structured clinical context — not a phone call — before the patient ever arrives."**

---

## Section 6 — Emergency Contact Workflow *(3:20 – 3:50)*

**Open the `/n/:token` link** sent to the emergency contact (no login required).

Show:

- **Live timeline** assembled from audit events
- **Patient SOS voice note** and **EMT assessment voice note** playback
- **AI summary** of the EMT's findings
- **Status updates** as the incident moves `accepted → arrived`
- **Hospital name + registration number** once accepted

> **"Family stays informed end-to-end without needing an account, without seeing the full medical record, and without anyone calling them manually."**

---

## Section 7 — Incident Transition *(3:50 – 4:20)*

Back to the Hospital tab.

1. **Possible Emergency → Confirmed Incident** — the queue updates live the moment the EMT submits.
2. **Ownership transfer** — case ownership moves from EMT to Hospital. The hospital can now accept, mark arrived, or dismiss.
3. Tap **Accept** → `HOSPITAL_ACCEPTED` with a `registration_number`. Tap **Patient Arrived** → `PATIENT_ARRIVED`, incident `status=arrived`, session `status=closed`.
4. The emergency contact's `/n/:token` page reflects every transition in real time.

> **"Every state change is a row in `audit_logs`, broadcast to the hospital via Realtime, and mirrored on the family portal — one source of truth."**

---

## Section 8 — Closing *(4:20 – 5:00)*

> **"Most emergency systems start when an ambulance is called.**
> **Savitri starts the moment someone notices something is wrong."**

In one workflow:

- **Patient** — pre-registered identity and medical context
- **Public** — turns any bystander into a verified first responder
- **Hospital** — clinical visibility before dispatch
- **EMT** — AI-assisted structured assessment on scene
- **Family** — informed live, without an account

**Five actors. One emergency. One coordinated chain of survival.**

---

## Section 9 — Demo Checklist

Run through this in the 5 minutes before going live:

- [ ] **Demo Mode enabled** — `VITE_SAVITRI_DEMO_MODE=true`; fixed Delhi location wired
- [ ] **Patient account** signed in on Phone 1 with a complete medical profile
- [ ] **QR active** — token visible, not revoked
- [ ] **At least one emergency contact** added (use your own phone for the `/n/:token` link)
- [ ] **Hospital staff account** signed in on the laptop, mapped to the demo hospital
- [ ] **EMT account** signed in on a second laptop tab
- [ ] **Notification token** for the contact copied and opened in a separate tab
- [ ] **Published URL** in use (`https://savitri-health.lovable.app`) — not the preview URL
- [ ] **Microphone permission** granted on both Patient and EMT browsers
- [ ] **Location permission** granted on the Patient device
- [ ] **Network** stable — AI summary call needs internet
- [ ] **Backup screen recording** ready in case live demo fails

---

## Section 10 — Common Judge Questions

### Privacy
> Scanning the QR alone reveals nothing. Every disclosure requires an explicit emergency declaration, scanner identification, and an audit row (`QR_SCANNED`, `PUBLIC_EMERGENCY_REPORTED`, `MEDICAL_INFO_DISCLOSED`) before any medical field is returned. Only first-response fields are shown to bystanders — never the full record.

### Data security
> Postgres with Row-Level Security on every public table. JWT-based auth via Supabase. Tokenized public access for `/e/:token` and `/n/:token` — no IDs in URLs. Service-role keys only run server-side in TanStack server functions. Voice notes are stored in a private Supabase Storage bucket and served via short-lived signed URLs.

### Scalability
> Stateless TanStack Start on Cloudflare Workers — global edge, auto-scaling. Postgres on managed Supabase. Realtime fan-out via `postgres_changes`. There is no server we have to scale by hand.

### Hospital integration
> The MVP runs as a standalone dashboard. The next step is bidirectional integration with HIS / EHR systems via FHIR. The audit log is already structured to be exported into hospital compliance systems.

### AI accuracy
> Gemini 2.5 Flash is used for transcription + structured summarisation, not diagnosis. Every AI summary is shown in a review modal that the EMT can edit before submitting. The EMT's submitted version — not the raw AI output — is what the hospital sees. There is also a manual assessment fallback when AI is unavailable.

### Regulatory compliance
> Designed against the principles behind HIPAA (US) and the DPDP Act (India): minimum-necessary disclosure, full audit trail, tokenised access, RLS, and explicit consent for emergency disclosure. Formal SOC 2 / HIPAA certification is a production-phase item, not an MVP claim.

### Commercial model
> B2B2C. Hospitals and ambulance networks subscribe per-bed or per-dispatch; patients use the consumer app for free. Optional premium tier for families (richer timeline, multi-patient, wearables integration).

### Why QR instead of NFC
> QR works on every smartphone camera with zero install, zero permissions, and zero hardware cost. NFC fails on a meaningful share of devices, requires the phone unlocked and held in the right spot, and adds a per-tag cost. QR also prints on cards, helmets, bracelets, and stickers — NFC tags do not.

### Why not use existing emergency apps
> Existing apps optimise for **one actor** — either the patient (SOS apps) or the hospital (dispatch software). Savitri is the only flow that connects **patient, bystander, EMT, hospital, and family in a single audited workflow**, with the bystander as a first-class participant. That bystander link is the missing piece in current systems.

---

*See also: `README.md` for project overview, `ARCHITECTURE.md` for system diagrams, `INCIDENT_LIFECYCLE.md` for the full state machine.*
