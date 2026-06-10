# Demo Guide

This guide allows judges to experience the complete Savitri Guardian workflow using the built-in demo accounts.

---

# Important

Please use the built-in demo accounts.

Do not create a new account.

On the login page, use the **Demo Login** options available at the bottom left of the screen.

Available demo roles:

* Patient
* Emergency Contact
* EMT
* Hospital

These accounts are preconfigured and connected to the same demo scenario.

---

# Browser Setup

To experience the complete workflow, use:

* One normal browser window for demo account logins
* One Incognito / Private browser window for the public helper flow

### Why?

If the QR code is opened in a browser session that is already logged in, the system may reuse the existing authenticated session.

Using an Incognito window ensures the public helper experience behaves as intended.

---

# Demo Scenario

In this scenario:

* A patient experiences a medical emergency.
* A member of the public discovers the patient.
* The public helper reports the emergency.
* The hospital receives the incident.
* An EMT responds.
* AI assists with handoff generation.
* Family members receive updates and can track the incident timeline.

---

# Step 1 — Login As Patient

Use the **Demo Patient** account.

After login:

1. Open the Patient Dashboard.
2. Navigate to the QR section.
3. Display the Emergency QR code.

This QR represents the patient's emergency identity.

Leave this screen open.

---

# Step 2 — Simulate A Public Helper

Using an Incognito / Private browser window:

1. Scan the patient's QR code.
2. Open the emergency link.
3. Continue as an unauthenticated public helper.

### Note

Using an Incognito window is recommended because it prevents the browser from reusing an existing authenticated session.

---

# Step 3 — Consent & Verification

After opening the QR link:

1. Review the consent screen.
2. Continue to the verification screen.
3. Enter any phone number.
4. Accept the declaration.
5. Click **Create Emergency**.

### Note

The current MVP uses a demo verification flow.

A real OTP service is not connected in this prototype.

The purpose of this step is to demonstrate accountable emergency reporting.

---

# Step 4 — Create The Incident

After verification:

1. Click **Create Emergency**.

Expected Result:

* An incident is created.
* Notifications are triggered.
* Coordination begins.

---

# Step 5 — Login As Hospital

Open another browser window.

Use the **Demo Hospital** account.

Navigate to the Hospital Dashboard.

Expected Result:

* The newly created incident appears.
* Patient context is visible.
* Incident details can be reviewed.

---

# Step 6 — Assign An EMT

From the Hospital Dashboard:

1. Open the incident.
2. Assign the incident to an EMT.

Expected Result:

* The EMT receives the assignment.
* Incident ownership is updated.

---

# Step 7 — Login As EMT

Open another browser window.

Use the **Demo EMT** account.

Navigate to the EMT Dashboard.

Expected Result:

* The assigned incident appears.
* Patient context is available.
* Incident timeline is visible.

---

# Step 8 — Add A Voice Note

Within the EMT workflow:

1. Open the assigned incident.
2. Record or upload a voice note.
3. Save the note.

Expected Result:

* The voice note is attached to the incident.
* AI processing becomes available.

---

# Step 9 — Review AI Summary

Return to the Hospital view.

Open the incident again.

Expected Result:

* AI-generated summary is available.
* Incident information is consolidated into a structured handoff.

This demonstrates Savitri's AI-assisted coordination capabilities.

**AI assists. Humans decide.**

---

# Step 10 — Login As Emergency Contact

Open another browser window.

Use the **Demo Emergency Contact** account.

Navigate to the Emergency Contact view.

Expected Result:

* Incident updates are visible.
* Timeline events are visible.
* Status changes are visible.

This demonstrates family-facing coordination.

---

# Step 11 — Review Timeline

Observe the complete incident timeline.

Typical events include:

* Emergency declared
* Verification completed
* Incident created
* Hospital notified
* EMT assigned
* Voice note added
* AI summary generated
* Family updated

This demonstrates end-to-end coordination across all stakeholders.

---

# What Judges Should Observe

### Identity

The patient can be discovered even when unable to communicate.

### Trust

Emergency access requires consent acknowledgement, phone verification, and declaration of intent.

### Coordination

A single incident is shared across public helpers, hospitals, EMTs, and family members.

### AI

Voice notes are transformed into structured summaries that improve handoffs.

### Platform Vision

The same identity, trust, and coordination infrastructure can support healthcare, travel safety, elder care, dementia support, workforce safety, and other critical life events.

---

# MVP Simplifications

To keep the demo focused and easy to evaluate, several production features are currently simulated:

* OTP verification uses a demo flow.
* Demo accounts are preconfigured.
* Demo stakeholders are already linked.
* AI functionality focuses on summarization and handoff assistance.
* Voice and telephony workflows are simulated.
* Call initiation and call routing are demonstrated as part of the workflow but are not currently connected to production telephony providers.

These simplifications allow judges to experience the complete coordination workflow without extensive setup while keeping the focus on identity, trust, context, coordination, and user experience.

---

# Production Roadmap Highlights

The following capabilities are intentionally simplified or simulated in the current MVP and are planned for future releases:

* Real OTP verification
* Production telephony integration
* Incident correlation and deduplication
* Bad actor detection and trust scoring
* Federated health data integrations
* Advanced AI coordination capabilities
* Expanded stakeholder workflows

The current prototype focuses on validating the core concept:

**Identity → Trust → Context → Coordination**

---

# Conclusion

Savitri Guardian is the first implementation of the broader Savitri Trusted Coordination Platform.

Its goal is simple:

**Help the right people receive the right information at the right time so they can take the right action.**
