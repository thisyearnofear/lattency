# Venue Capture Consent — template (v0.1, for counsel review)

**Status:** draft, NOT legal advice — to be reviewed by counsel in each launch jurisdiction before use. Kenya deployments additionally need express-consent language satisfying DPA 2019 s.37.

---

## Venue Capture & Publication Consent

**Venue:** ______________________ (trading name)
**Address:** ______________________
**Authorised signatory:** ______________________ (name, role)
**Lattency capture ID:** ______________________

By signing, the signatory confirms they are the owner or an authorised representative of the Venue and agrees:

1. **Permission to capture.** You permit Lattency (or a Lattency-commissioned contributor) to film a walkthrough of the Venue interior for the purpose of creating a navigable 3D model ("the Scan") and publishing it on Lattency.
2. **Timing.** Capture will take place during the agreed off-peak window: ______ (date), ______ (time). You agree to keep the Venue as close to empty as practicable during this window.
3. **Patron notice.** You agree to display the supplied notice ("3D scanning in progress") at the entrance for the duration of the capture, and to inform present staff.
4. **Anonymisation.** Lattency will blur faces and identifiable personal items in the source footage before creating the Scan, and will delete raw footage within 72 hours of processing.
5. **Publication & review.** You may review the Scan before publication. Publication occurs only after your written approval or 7 days' non-response to the review link, whichever is earlier.
6. **Ongoing control.** You may request editing, re-blurring, or complete takedown at any time via the venue claim flow or support email. Takedown is honoured within 48 hours.
7. **Licence.** You grant Lattency a non-exclusive, worldwide, revocable-on-request licence to publish the Scan on the Lattency platform for the purpose of helping users choose workspaces. You retain all rights in your premises and branding.
8. **No payment / consideration:** ______________ (bounty credit / free hosted tour / none — circle one).
9. **Accuracy.** You confirm that to your knowledge nothing in the captured area requires third-party consent you cannot give (e.g., artworks, franchise-protected trade dress). Flag anything you want excluded: ______________.

Signed: ______________________  Date: ____________

---

## Contributor attestation (capture-day, in-app)

Required before upload — mirrors the two checkboxes already in `components/capture-consent-form.tsx`:

- [ ] "The venue has given me permission to film this walkthrough."
- [ ] "I gave the venue's notice to anyone nearby, or the space was empty."

Plus the explicit third item this document adds (recommended): "I will not film minors, and I will stop filming if asked."

---

## What this does and doesn't cover

**Covered:** venue permission (the contract/licence-to-enter issue), patron notice evidence, revocable takedown (the remedy regulators expect), raw-footage TTL commitment.

**NOT covered — needs counsel:** staff-vs-owner authority edge cases; franchise/trade-dress decor claims; whether a splat is a BIPA "scan of face geometry" if blur fails; Kenya DPA s.37 commercial-use language (needs express-consent clause for Nairobi); enforceability of contributor warranties against consumer contributors under UK/EU consumer law.
