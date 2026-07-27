# Base44 Dev Build-Off — Demo Video Script

Target length: **2:20–2:45** (form says "recommended 2–3 min"). Record screen +
voiceover. Browser at 1440×900, dev tools closed, production URL in the address
bar. OBS or Screen Studio recommended.

**Pre-flight (do this before you hit record):**
- Confirm Base44 is deployed and `NEXT_PUBLIC_BASE44_APP_ID` is set in `.env.local`.
- Run `pnpm seed` so there are 30+ venues with measurements across the three cities.
- Open https://lattency.vercel.app and confirm it redirects to /london, the map
  renders with stations, the "live · listening for readings" pill is visible,
  and the "Ask the Oracle" button is bottom-right.
- Have London, Nairobi, and SF each open once so the city switcher is warm.
- Have a second browser window (or incognito) ready to submit a speed test
  simultaneously, so you can show the realtime update live on camera.
- Close all browser extensions, hide bookmarks bar.

---

## 0:00–0:12 · HOOK

**On screen:** The London map, fully loaded, stations colour-coded by tier. Slow
push-in (Screen Studio zoom or OBS crop keyframe). The "live" pill pulses
top-left of the map section.

**Say:**
> "This is Lattency. A live metro map of every workspace with verified wifi —
> right now in London, Nairobi, and San Francisco, on one engine. Contributors
> run speed tests and earn crypto. An AI reads the whole network. And the map
> updates the instant anyone, anywhere, submits a reading."

Pause one beat. Let the map breathe.

**Action:** Open the city switcher (top nav) and flip to Nairobi — split-flap
animation, new board loads. Then back to London. Two seconds, don't narrate it;
the visual does the work.

---

## 0:12–0:40 · THE PRODUCT (map + realtime)

**On screen:** Click a station marker → the detail drawer slides in. Show the
speed distribution chart (morning/afternoon/evening), the metadata rows (power,
seating, noise), the tier badge.

**Say:**
> "Every venue is a station. The three lines are speed tiers — Express at fifty
> megabits or more, Local between ten and forty-nine, Suspended below ten. Click
> any station and you get the full picture: verified speeds by time of day,
> objective metadata, no star ratings, no vibes — just facts."

**Action:** While the drawer is open, switch to the second window and submit a
speed test (or trigger one via the contribution form). Switch back. The "new
reading on the network" flash appears and the station's tier/count updates.

**Say:**
> "Watch this. Someone just ran a speed test two tabs away. The map picked it up
> in realtime — no refresh, no reload. That's Base44's entity subscriptions
> pushing the update straight to every open client."

---

## 0:40–1:15 · THE AI CONCIERGE

**On screen:** Click "Ask the Oracle" bottom-right → the chat panel opens.
Type (or paste) the first suggestion: *"Where can I take a video call nearby?"*

**Say:**
> "Now the part no other wifi map has. This is the Workspace Concierge — a
> Base44 AI agent with read access to every verified reading on the network."

**On screen:** The agent responds with 1–2 venue recommendations citing actual
speed numbers. Show the tool-call indicator ("checking the map…") resolving to
the answer.

**Say:**
> "It doesn't guess. It queries the live dataset — median download, jitter,
> packet loss — and recommends based on what you actually need. Ask it for
> quiet, and it finds quiet. Ask it for fifty megabits with oat milk, and it
> finds that too."

**Action:** Type a second question: *"Quiet spot with oat milk and outlets?"*
Let it answer.

---

## 1:15–1:35 · AI VENUE SUMMARY (integrations)

**On screen:** In the still-open detail drawer, scroll to the "AI take" box.
Click "Generate one-line review." The LLM writes a punchy editorial line.

**Say:**
> "Every venue also gets an AI-generated one-liner — Base44's built-in LLM
> integration reads the speed stats and metadata and writes a character sketch.
> No API keys, no separate service. It's one function call inside the backend."

---

## 1:35–2:00 · BOUNTIES + AUTOMATIONS

**On screen:** Scroll down to the bounty board. Show 2–3 open bounties with
progress bars. Then open the sponsor dashboard (or show the `/partners` page).

**Say:**
> "Sponsors fund bounties — 'first verified café in this neighbourhood,' 'map
> three oat-milk spots in Kilimani.' Contributors close them and earn NIM on the
> Nimiq blockchain. And the progress tracking is automated: a Base44 entity-event
> automation fires on every new measurement, bumps the right bounty, and flags it
> claimable when the target's hit. A scheduled cron job expires stale bounties
> nightly. Zero manual work."

---

## 2:00–2:25 · THE ARCHITECTURE BEAT + CLOSE

**On screen:** Cut to a simple architecture slide (or a code editor showing
`base44/` folder structure: entities, functions, agents). Hold 5 seconds.

**Say:**
> "The whole backend is Base44. Four entities. Seven serverless functions. An AI
> agent. Two automations. Realtime subscriptions. Built-in LLM integrations. And
> auth. The frontend is Next.js on Vercel, pointing entirely at the Base44 SDK.
> There is no other backend."

**On screen:** Back to the live map. Slow zoom out to full network.

**Say:**
> "Lattency. A physical-world oracle for the agentic era. Built on Base44,
> powered by Nimiq. Thanks."

Fade to black. End card: live URL + repo URL.

---

## Notes for the editor

- Total runtime target: 2:20–2:45. If it runs long, cut the second concierge
  question (1:15 section) and trim the architecture beat.
- The realtime moment (0:12–0:40) is the single strongest shot. If you only
  get one thing right on camera, get that.
- Background music: lo-fi or light electronic, -20dB under voice. Cut it during
  the "watch this" realtime moment for impact.
- End card should hold 3 seconds minimum with both URLs legible.
