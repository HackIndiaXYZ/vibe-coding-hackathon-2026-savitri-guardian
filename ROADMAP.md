# Savitri Guardian — Product Roadmap

> **Version:** MVP → Production
> **Last updated:** May 2026
> **Audience:** Hackathon judges, recruiters, product leaders, healthcare operators, investors, future engineering teams

---

## 1. Product Vision

> *"Savitri Guardian ensures that no medical emergency begins with anonymity, confusion, or delayed coordination."*

When a person becomes unconscious or incapacitated in a public place, the first ten minutes — the *platinum ten* — determine whether they survive, recover, or suffer permanent damage. Today, those minutes are lost to questions that nobody on the scene can answer:

- Who is this person?
- What are they allergic to?
- Who should be called?
- Which hospital should receive them?

Savitri Guardian solves this by creating a single, coordinated emergency workflow in which **patients, bystanders, EMTs, hospitals, and families** all participate — each with exactly the access they need, and nothing more.

The patient carries a QR code. The bystander scans it. The hospital sees the report in real time. The EMT records a voice note and an AI generates a structured handoff brief. The family follows the entire chain through a tokenized portal. No app install required for anyone except the patient.

---

## 2. Phase 1 — Validated MVP

**Status:** ✅ Completed  
**Goal:** Prove the core workflow end-to-end with five stakeholder types, audit logging, and AI-assisted triage.

### 2.1 Patient

| Feature | Status | Notes |
|---------|--------|-------|
| Medical profile | ✅ | Allergies, conditions, medications, blood group, implants, DNR |
| Emergency contacts | ✅ | Name, relationship, phone, priority order |
| QR identity | ✅ | Rotating token tied to patient account; old token revoked on reissue |
| SOS workflow | ✅ | One-tap SOS with session creation and real-time status |
| SOS voice recording | ✅ | Optional voice note recorded and uploaded to secure storage |
| GPS capture | ✅ | Location captured with explicit failure logging when denied |
| AI summary | ✅ | EMT voice notes transcribed and summarized via Gemini 2.5 Flash |

### 2.2 Public Scanner

| Feature | Status | Notes |
|---------|--------|-------|
| QR scan workflow | ✅ | Zero-install emergency reporting from any phone camera |
| Emergency declaration | ✅ | Scanner must explicitly declare emergency before medical data is shown |
| Identity logging | ✅ | Scanner name and contact recorded with the report |
| Privacy-preserving disclosure | ✅ | Only first-response fields released (ICE, allergies, blood group, critical conditions) |
| Possible emergency creation | ✅ | Report routed to hospital dashboard in real time |

### 2.3 Hospital

| Feature | Status | Notes |
|---------|--------|-------|
| Possible Emergencies queue | ✅ | Unconfirmed public scans appear in real time via Supabase Realtime |
| Confirmed Incidents queue | ✅ | EMT-accepted cases with registration number tracking |
| EMT assignment | ✅ | Hospital assigns EMT to a possible emergency; EMT sees dispatch in queue |
| Call scanner | ✅ | Direct call action logged against the session |
| Call patient | ✅ | Direct call action logged against the session |
| Call emergency contact | ✅ | Direct call action logged against the session |
| Incident management | ✅ | Accept, mark arrived, dismiss with reason logging |

### 2.4 EMT

| Feature | Status | Notes |
|---------|--------|-------|
| Assigned case workflow | ✅ | EMT sees dispatched cases in their dashboard |
| Patient profile review | ✅ | Full medical profile visible after QR scan or hospital assignment |
| Patient SOS audio playback | ✅ | EMT can play the patient's SOS voice note from the scene |
| EMT assessment recording | ✅ | Voice note uploaded to patient-scoped Storage path |
| AI-assisted assessment | ✅ | Gemini transcribes and summarizes into structured clinical brief |
| Manual assessment fallback | ✅ | Structured form available when AI is unavailable |
| Incident submission | ✅ | Report submitted to hospital; incident created; ownership transfers |

### 2.5 Emergency Contact

| Feature | Status | Notes |
|---------|--------|-------|
| Timeline | ✅ | Live incident timeline assembled from audit events for the session |
| Voice playback | ✅ | Patient SOS and EMT assessment voice notes playable in portal |
| AI summaries | ✅ | Structured summary visible once Gemini has processed the recording |
| Incident updates | ✅ | Status updates from open → submitted → accepted → arrived → closed |

### 2.6 Platform

| Feature | Status | Notes |
|---------|--------|-------|
| Audit logging | ✅ | Every privileged action written to immutable audit log |
| Notifications | ✅ | In-app notification rows with tokenized links |
| Realtime updates | ✅ | Supabase Realtime subscriptions for dashboard and portal |
| Role-based access | ✅ | `user_roles` table with `has_role()` SECURITY DEFINER function |
| Supabase RLS | ✅ | Row Level Security on every public-schema table |
| Demo Mode | ✅ | Fixed Delhi location, safe defaults, no external PSTN/SMS dependency |

### 2.7 MVP Metrics

- **4** stakeholder workflows implemented end-to-end
- **13** workflow validation tests passed
- **< 30 seconds** from QR scan to emergency report creation
- **Real-time** hospital notification delivery
- **AI-generated** EMT handoff summaries in production via Lovable AI Gateway
- **Immutable audit trail** for every critical action

---

## 3. Phase 2 — Hospital Pilot Program

**Status:** 📋 Planned  
**Goal:** Deploy with a single hospital and EMT fleet to validate operational workflows in a live clinical environment.

### 3.1 Features

| Feature | Rationale |
|---------|-----------|
| **OTP verification for public reporters** | Bystander phone numbers verified before reports reach hospital queue, reducing false alarms and enabling callback |
| **Hospital onboarding workflow** | Self-service enrollment for hospital administrators, department mapping, and shift roster setup |
| **EMT onboarding workflow** | Mobile-first EMT registration, credential verification, and fleet assignment |
| **Hospital administration console** | Staff management, shift scheduling, department configuration, and QR access control |
| **Analytics dashboard** | Incident volume, response time trends, EMT utilization, and false-alarm rates per hospital |
| **Incident reporting exports** | PDF/CSV export of closed incidents for compliance, billing, and quality review |
| **Advanced notification preferences** | Hospital-configurable alert channels (push, SMS, email) with escalation rules |
| **Audit reporting dashboard** | Filterable, time-ranged audit views for compliance officers and quality assurance |
| **Multi-hospital support** | Single platform instance serving multiple hospital tenants with data isolation |
| **Operational monitoring** | Uptime dashboards, error alerting, and performance telemetry for the operations team |

### 3.2 Pilot Metrics

- Hospital adoption: **1 hospital network, 3 departments**
- EMT adoption: **10–20 active EMTs**
- Incident completion rate: **> 80% of reports reach closed or dismissed terminal state**
- False alarm rate: **< 15%** (measured against OTP-filtered reports)
- Average time from scan to hospital awareness: **< 60 seconds**

---

## 4. Phase 3 — Networked Emergency Response Platform

**Status:** 🔮 Future  
**Goal:** Scale from a single hospital pilot to a city-wide or regional emergency response network with native dispatch and EHR integration.

### 4.1 Features

| Feature | Rationale |
|---------|-----------|
| **Nearest hospital routing** | Automatic routing of public reports to the closest accepting hospital based on real-time capacity |
| **Geospatial hospital discovery** | Map-based view of hospital status, bed availability, and specialty capabilities |
| **Ambulance dispatch integration** | Direct API integration with government 112 services and private ambulance fleets for automated dispatch |
| **FHIR integration** | Push confirmed incident data to hospital EHR systems via HL7 FHIR R4 |
| **EHR integration** | Bidirectional sync with Epic, Cerner, and other major EHR platforms for patient record enrichment |
| **Multi-location hospitals** | Enterprise hospital groups with location-aware routing and consolidated reporting |
| **SLA monitoring** | Contractual response-time tracking with automated escalation when thresholds are breached |
| **Escalation workflows** | Automatic rerouting to backup hospitals, secondary EMT fleets, and supervisor alerts |
| **Call-center integration** | Integration with emergency call-center software (Cisco, Avaya, Genesys) for dispatcher visibility |
| **Enterprise reporting** | Cross-hospital analytics, benchmarking, and regulatory reporting dashboards |

### 4.2 Commercial Metrics

- Time to hospital awareness: **< 30 seconds**
- Time to EMT assignment: **< 2 minutes**
- Time to patient arrival: **< 15 minutes urban, < 30 minutes rural**
- Lives impacted: **Measured per quarter via hospital partner reporting**
- Network coverage: **3+ hospital networks, 50+ EMTs active**

---

## 5. Phase 4 — Intelligent Emergency Ecosystem

**Status:** 🌅 Vision  
**Goal:** Evolve from a reactive emergency platform into a predictive health safety network that anticipates emergencies before they occur.

### 5.1 Features

| Feature | Rationale |
|---------|-----------|
| **Wearable integration** | Direct SOS triggers from Apple Watch, Fitbit, Garmin, and medical alert pendants |
| **Smartwatch SOS** | Fall-detection-triggered automatic SOS with patient consent and cancellation window |
| **Fall detection** | AI-powered fall detection from accelerometer and gyroscope data on wearable devices |
| **Crash detection** | Integration with smartphone crash detection (Apple Crash Detection, Google Car Crash) for automatic emergency session creation |
| **Predictive risk scoring** | ML models analyzing patient profile, location history, and environmental data to flag high-risk periods |
| **Family health network** | Linked family accounts with shared health insights, cross-notification, and collective emergency response |
| **AI triage assistant** | Real-time AI guidance for bystanders during the platinum ten minutes (CPR instructions, choking response, bleeding control) |
| **Voice translation** | Real-time translation of EMT voice notes into the receiving hospital's preferred language |
| **Multi-language emergency workflows** | Full internationalization of all public-facing flows for deployment in non-English-speaking regions |
| **National emergency network integration** | Direct integration with national 112/911 infrastructure for seamless handoff from bystander to professional dispatch |

---

## 6. Technical Evolution

### 6.1 Current (MVP)

| Layer | Technology |
|-------|------------|
| Framework | TanStack Start v1 (SSR + server functions) |
| Database | Supabase Postgres with Row Level Security |
| Realtime | Supabase Realtime (PostgreSQL changes) |
| Storage | Supabase Storage (voice notes) |
| AI | Gemini 2.5 Flash via Lovable AI Gateway |
| Runtime | Cloudflare Workers (edge SSR) |
| Styling | Tailwind CSS v4 + shadcn/ui |
| Auth | Supabase Auth (JWT, email/password, Google OAuth) |

### 6.2 Pilot

| Addition | Purpose |
|----------|---------|
| Event-driven workflows | Decouple notification fan-out from request lifecycle for reliability |
| Queue processing | Background job processing for AI transcription, SMS dispatch, and report generation |
| Monitoring | Application performance monitoring, error tracking, and uptime alerting |
| Rate limiting | Protect public endpoints from abuse and ensure fair usage |

### 6.3 Commercial

| Addition | Purpose |
|----------|---------|
| Multi-region architecture | Deploy edge functions and databases across geographic regions for sub-100ms response globally |
| Disaster recovery | Cross-region database replication and automated failover |
| Compliance tooling | Automated audit log archival, data retention enforcement, and compliance reporting pipelines |
| Load balancing | Horizontal scaling of serverless functions to handle city-wide incident volumes |

---

## 7. Regulatory Roadmap

### 7.1 MVP — Privacy-First Foundation

- ✅ Privacy-preserving medical disclosure (tiered access, no PII in URLs)
- ✅ Immutable audit logging for all privileged actions
- ✅ Row Level Security with role-based access control
- ✅ Tokenized public access (rotating, revocable, no account required)
- ✅ Input validation and sanitization on every endpoint

### 7.2 Pilot — Security Hardening

- 📋 Third-party security review and architecture assessment
- 📋 Penetration testing of public endpoints, QR token lifecycle, and notification system
- 📋 Formal data retention policies with automated enforcement
- 📋 Incident response plan and breach notification procedures
- 📋 Staff training materials for hospital and EMT users

### 7.3 Commercial — Compliance Certification

- 🔮 SOC 2 Type II certification
- 🔮 HIPAA readiness assessment and Business Associate Agreements with hospital partners
- 🔮 DPDP (Digital Personal Data Protection) compliance for Indian market operations
- 🔮 Hospital compliance integrations (HITECH, state-level healthcare privacy laws)
- 🔮 Regular third-party audits and continuous compliance monitoring

---

## 8. Success Metrics

### 8.1 MVP Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Emergency reports created | > 100 in demo/testing | Database count of `emergency_sessions` rows |
| EMT response participation | All demo EMT accounts active | Dashboard assignment acceptance rate |
| Contact notification delivery | 100% of SOS triggers notify contacts | Notification row insertion + resolution tracking |
| AI summary generation | < 10 seconds per voice note | Server function execution time logging |
| Audit log completeness | 100% of critical actions logged | Automated audit coverage test suite |

### 8.2 Pilot Metrics

| Metric | Target |
|--------|--------|
| Hospital adoption | 1 hospital network onboarded |
| EMT adoption | 10–20 active EMTs with > 80% login rate |
| Incident completion rate | > 80% reach closed or dismissed terminal state |
| False alarm rate | < 15% after OTP verification |
| Report-to-hospital latency | < 60 seconds median |

### 8.3 Commercial Metrics

| Metric | Target |
|--------|--------|
| Time to hospital awareness | < 30 seconds median |
| Time to EMT assignment | < 2 minutes median |
| Time to patient arrival | < 15 minutes urban, < 30 minutes rural |
| Network coverage | 3+ hospital networks, 50+ EMTs |
| Lives impacted | Tracked quarterly via hospital partner outcomes data |
| Platform uptime | 99.9% SLA |

---

## 9. Product Principles

These principles guide every product decision at Savitri Guardian — from MVP to national network.

### 9.1 Privacy Before Disclosure

Medical information is disclosed only after explicit emergency declaration, scanner identification, and audit logging. The full record is never shown to anyone who does not need it. The bystander sees allergies and blood group, not psychiatric history or sexual health.

### 9.2 Audit Everything

Every access, every scan, every status change, every voice note playback is logged. The audit trail is append-only and queryable. If it happened, there is a record. If there is no record, it did not happen.

### 9.3 Human Remains in Control

AI assists — it does not decide. The EMT can override the AI summary. The hospital can dismiss a report. The patient can cancel an SOS. Every automated action has a human checkpoint.

### 9.4 Family Stays Informed

Emergency contacts are not an afterthought. They receive the same live timeline as the hospital. They hear the voice note from the scene. They know which hospital accepted the case and what registration number was assigned. No one learns about an emergency hours later.

### 9.5 Reduce Emergency Friction

The bystander does not need an app. The emergency contact does not need an account. The EMT scans and assesses in under five seconds. Every interaction is designed for panic, not patience.

### 9.6 Work with Any Smartphone

No NFC. No Bluetooth pairing. No special hardware. Any phone with a camera and a browser can scan a Savitri QR code and report an emergency. The platform degrades gracefully on older devices and slower networks.

### 9.7 Assist Professionals, Don't Replace Them

Savitri does not replace 112, ambulance dispatch, or clinical judgment. It gives professionals the information they need to make faster, better decisions. The paramedic still treats the patient. The hospital still triages. Savitri just makes sure nobody starts blind.

---

*See also: [`README.md`](./README.md) for project overview, [`ARCHITECTURE.md`](./ARCHITECTURE.md) for system diagrams, [`INCIDENT_LIFECYCLE.md`](./INCIDENT_LIFECYCLE.md) for the emergency workflow, and [`DEMO_SCRIPT.md`](./DEMO_SCRIPT.md) for the judge walkthrough.*
