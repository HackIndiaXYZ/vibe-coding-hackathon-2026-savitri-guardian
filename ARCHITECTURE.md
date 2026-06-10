# Architecture

> The first emergency is informational.

Savitri Guardian is the first implementation of the broader Savitri Trusted Coordination Platform, focused on medical emergencies and the Golden Hour.

The platform is designed around a simple goal:

**Help the right people receive the right information at the right time so they can take the right action.**

---

# Conceptual Architecture

```text
Patient
   │
   ▼
Emergency Identity (QR)
   │
   ▼
Public Helper
   │
   ▼
Emergency Incident
   │
   ├────────► Family
   │
   ├────────► EMT
   │
   └────────► Hospital
                    │
                    ▼
             Coordinated Response
```

---

# Platform Layers

```text
Ecosystem Layer
        ▲
        │
AI Layer
        ▲
        │
Coordination Layer
        ▲
        │
Context Layer
        ▲
        │
Trust Layer
        ▲
        │
Identity Layer
```

---

# Identity Layer

## Purpose

Answer:

* Who is this person?
* Who should be informed?
* Who can help?
* Who can act on their behalf?

## Built Today

* Patient Profiles
* Emergency Identity
* Emergency QR
* Emergency Contacts

## Future Direction

* Representation Framework
* Guardian Relationships
* Caregiver Relationships
* Portable Identity
* Cross-Organization Identity

---

# Trust Layer

## Purpose

Answer:

* Can this information be trusted?
* Why is access allowed?
* Who is accountable?

## Built Today

* OTP Verification
* Consent Flow
* Emergency Declaration
* Audit Trail
* Notifications

## Future Direction

* Bad Actor Detection
* Trust Scoring
* Abuse Prevention
* Risk-Based Access Controls
* Reputation Systems

---

# Context Layer

## Purpose

Transform information into understanding.

## Built Today

* Emergency Profiles
* Medical Information
* Incident Data
* Contact Information

## Future Direction

* Federated Health Data
* Verified Data Sources
* Medical Record Connectors
* Insurance Connectors
* Context Aggregation Engine

---

# Coordination Layer

## Purpose

Coordinate all stakeholders involved in an emergency.

## Built Today

* Public Reporting
* Family Notification
* EMT Workflow
* Hospital Workflow
* Incident Tracking

## Future Direction

* Incident Correlation Engine
* Multi-Reporter Coordination
* Care Coordination
* Cross-Organization Coordination
* Disaster Coordination

Example:

```text
SOS Report
+
Public Report
+
EMT Report
+
Hospital Report

↓

Single Coordinated Incident
```

---

# AI Layer

## Purpose

Transform information into actionable context.

## Built Today

* Voice Note Summaries
* Incident Summaries
* AI-Assisted Handoffs

## Future Direction

* Incident Correlation
* Risk Detection
* Missing Information Discovery
* Stakeholder Recommendations
* Care Coordination Agents
* Trusted Decision Support

### Principle

AI assists.

Humans decide.

---

# Ecosystem Layer

## Purpose

Extend trusted coordination beyond healthcare emergencies.

## Current Focus

* Medical Emergencies

## Future Applications

* Child Safety
* Elder Care
* Dementia Support
* Travel & Tourism Safety
* Workforce Duty of Care
* Institutional Safety
* Missing Persons
* Disaster Response
* Community Safety

---

# Business Ecosystem

## B2C

Individuals and Families

Examples:

* Young Professionals Away From Home
* Solo Living Adults
* Aging Parents
* Students
* Travelers

---

## B2B

Organizations responsible for people.

Examples:

* Hospitals
* Ambulance Providers
* Universities
* Employers
* Assisted Living Providers
* Tourism Operators
* Travel Safety Programs

---

## B2G

Public safety and public health ecosystems.

Examples:

* Smart Cities
* Emergency Response Programs
* Public Health Systems
* Disaster Management Agencies
* Tourism Departments

---

# Platform Vision

Today:

```text
Trusted Coordination
        ↓
Medical Emergencies
```

Tomorrow:

```text
Trusted Coordination
    ├── Healthcare
    ├── Child Safety
    ├── Elder Care
    ├── Dementia Support
    ├── Travel Safety
    ├── Workforce Safety
    ├── Missing Persons
    ├── Disaster Response
    └── Community Safety
```

Savitri Guardian is the first implementation of a broader vision:

**Trusted Coordination for Critical Life Events.**
