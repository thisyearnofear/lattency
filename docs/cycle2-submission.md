# Nimiq Mini Apps Competition — Cycle 2 submission pack

**Deadline: Friday 18 Sep 2026, 23:59 UTC.** Submit at
https://miniappscompetition.com/submit (Registration Dashboard).

The portal creates a PR under
`nimiq/miniappscompetition-submissions/cycle2/<github_login>/`. Automated
checks require: public MIT repo, reachable demo, public video
(YouTube / Loom / Vimeo / X), images, and a valid `submission.yaml`.

---

## Status audit (as of prep)

| Check | Status |
|---|---|
| Public GitHub repo | ✅ https://github.com/thisyearnofear/lattency |
| MIT `LICENSE` | ✅ detected by GitHub as MIT |
| Live demo HTTP 200 | ✅ https://lattency.vercel.app/ → `/london` |
| `/london` `/nairobi` `/sf` `/tour` `/partners` `/me` | ✅ all 200 |
| Nimiq Pay SDK (`init` + `listAccounts` + `requestPayment`) | ✅ wired |
| NIM bounty fund + claim (real `@nimiq/core` txs) | ✅ code path live; confirm prod not on `NIMIQ_PAYOUT_MOCK=1` |
| Cycle 2 entry already filed | ❌ not in `cycle2/` yet — **you still need to submit** |
| Demo video hosted (YT/Loom/Vimeo/X) | ❌ local mp4 only — **upload tonight** |
| Skool post URL | ❌ draft below — **post + paste link** |
| Public social post URL | ❌ draft below — **post + paste link** |
| Submission screenshots (3–5) | ❌ grab from prod — assets folder has icon + thumbnail |

Prepped assets in `docs/cycle2-assets/`:
- `icon.png` (512×512 from `app/icon.svg`)
- `thumbnail.png` (1200×630 live OG image)

---

## Form fields (copy-paste)

| Field | Value |
|---|---|
| **App name** | Lattency |
| **Category** | Earning |
| **Pricing** | Free |
| **Repo** | https://github.com/thisyearnofear/lattency |
| **Demo** | https://lattency.vercel.app/ |
| **Video** | _(paste YouTube / Loom / Vimeo / X URL after upload)_ |
| **GitHub login** | thisyearnofear |
| **Team name** | Lattency |
| **Team members** | thisyearnofear _(add co-builders if any, max 5)_ |
| **Contact email** | _(your email)_ |
| **X account** | _(your @handle, no URL needed if form asks handle)_ |
| **Prize wallet** | _(your Nimiq address for USDT prize payout)_ |
| **Heard about** | X _(or Skool / friend / other)_ |
| **Skool post URL** | _(after you post)_ |
| **Social post URL** | _(after you post)_ |

### Tagline (≤120 chars)

> Café wifi, mapped like transit. Run a speed test, earn NIM from sponsor bounties. Live in 3 cities.

### Description (≤250 words — 198 words)

> Lattency is a crowdsourced metro map of café wifi speeds, live in London, Nairobi, and San Francisco. Venues are stations; the lines are speed tiers — Express (≥50 Mbps, video calls OK), Local (10–49 Mbps), and Suspended (<10 Mbps).
>
> It's for remote workers and travellers who need to know where they can actually take a call — and for sponsors who want that data collected. Anyone can contribute in under 60 seconds, no account: open the map, run a real in-browser speed test from where you're sitting, and the station appears on the line. The speed test is the trust mechanism; a real round-trip can't be faked.
>
> Nimiq Pay is the payment rail on both sides. Inside the Mini App, sponsors fund bounties in NIM via `requestPayment` into escrow. When a contributor's verified reading closes a bounty, NIM pays out to their connected wallet as a real on-chain transaction — signed with `@nimiq/core`, with concurrency locking and an explorer link on the receipt. The Mini App SDK's `init()` and `listAccounts()` bind the wallet; claim is one tap.
>
> One engine serves three cities, with a realtime map, an AI concierge that answers "where should I work?", and objective workspace metadata — power, seating, noise — not star ratings.

### Builder story (short)

> I kept losing calls in cafés that looked fine on Google Maps. Star ratings don't measure wifi. Lattency turns verified speed tests into a metro map people can read at a glance, and uses Nimiq Pay so sponsors can fund the readings and contributors get paid the moment a bounty closes. Built as a real Mini App — wallet in, NIM out — not a logo sticker.

---

## Suggested `submission.yaml` (what the portal will generate)

Fill blanks, then keep a local copy for reference:

```yaml
app_name: Lattency
category: Earning
tagline: >-
  Café wifi, mapped like transit. Run a speed test, earn NIM from sponsor
  bounties. Live in 3 cities.
description: >-
  Lattency is a crowdsourced metro map of café wifi speeds, live in London,
  Nairobi, and San Francisco. Venues are stations; the lines are speed tiers —
  Express (≥50 Mbps, video calls OK), Local (10–49 Mbps), and Suspended
  (<10 Mbps).

  It's for remote workers and travellers who need to know where they can
  actually take a call — and for sponsors who want that data collected. Anyone
  can contribute in under 60 seconds, no account: open the map, run a real
  in-browser speed test from where you're sitting, and the station appears on
  the line. The speed test is the trust mechanism; a real round-trip can't be
  faked.

  Nimiq Pay is the payment rail on both sides. Inside the Mini App, sponsors
  fund bounties in NIM via requestPayment into escrow. When a contributor's
  verified reading closes a bounty, NIM pays out to their connected wallet as a
  real on-chain transaction — signed with @nimiq/core, with concurrency locking
  and an explorer link on the receipt. The Mini App SDK's init() and
  listAccounts() bind the wallet; claim is one tap.

  One engine serves three cities, with a realtime map, an AI concierge that
  answers "where should I work?", and objective workspace metadata — power,
  seating, noise — not star ratings.
pricing: Free
repo_url: https://github.com/thisyearnofear/lattency
demo_url: https://lattency.vercel.app/
video_url: REPLACE_ME
contact_email: REPLACE_ME
team_name: Lattency
team_members:
  - thisyearnofear
x_account: REPLACE_ME
builder_story: >-
  I kept losing calls in cafés that looked fine on Google Maps. Star ratings
  don't measure wifi. Lattency turns verified speed tests into a metro map
  people can read at a glance, and uses Nimiq Pay so sponsors can fund the
  readings and contributors get paid the moment a bounty closes. Built as a
  real Mini App — wallet in, NIM out — not a logo sticker.
skool_post_url: REPLACE_ME
social_post_url: REPLACE_ME
heard_about: X
icon: icon.png
thumbnail: thumbnail.png
screenshots:
  - screenshot-1.png
  - screenshot-2.png
  - screenshot-3.png
github_login: thisyearnofear
```

---

## Tonight's runbook (do in this order)

### 1. Confirm production payouts (5 min)

In Vercel env for the production project:
- `NIMIQ_PRIVATE_KEY` set
- `NIMIQ_PAYOUT_MOCK` **unset** or `0`
- `NIMIQ_NETWORK` = `testnet` (or `mainnet` if escrow is funded there)
- `NEXT_PUBLIC_BASE44_APP_ID` set

Smoke: open https://lattency.vercel.app/london → map has stations → open a
station → bounties visible on `/partners`.

### 2. Record + upload demo video (30–45 min) — blocker

Fastest path that still passes the check:
1. Open https://lattency.vercel.app/tour (self-running reel) **or** screen-record
   the live product for ~60–90s.
2. Must show: map → speed test / contribute beat → bounty / Claim NIM (or fund
   bounty on `/partners`) → wallet connection if inside Nimiq Pay.
3. Upload as **public** YouTube Short, Loom, Vimeo, or X video.
4. Paste the URL into the form.

Script: `docs/base44-demo-video.md` (trim to ~90s; lead with Nimiq payout, not
Base44 architecture — judges score Nimiq integration at 25 pts).

Existing local file (may be outdated stack): `public/demo/lattency-demo.mp4` —
only reuse if it still shows NIM/Nimiq Pay; otherwise re-record.

### 3. Grab 3–5 screenshots (10 min)

Phone or desktop, production URL, no bookmarks bar:

1. London map with Express/Local/Suspended stations
2. Station drawer with speed + metadata
3. Contribution / speed-test mid-run
4. Bounties board or Claim NIM
5. Optional: city switcher mid-flip, or `/tour`

Save as `screenshot-1.png` … into the upload folder with
`docs/cycle2-assets/icon.png` + `thumbnail.png`.

### 4. Skool post (5 min) — 2 pts

Post in https://www.skool.com/miniappscompetition :

> **Lattency** — café wifi mapped like a metro network. Contributors run a real
> speed test; sponsors fund bounties in **NIM** inside Nimiq Pay; closing a
> bounty pays the connected wallet on-chain. Live in London, Nairobi, SF.
>
> Demo: https://lattency.vercel.app/
> Tour: https://lattency.vercel.app/tour
> Repo: https://github.com/thisyearnofear/lattency
>
> Built for Cycle 2 — feedback welcome, especially on the claim flow inside
> Nimiq Pay.

Copy the post URL into `skool_post_url`.

### 5. Public social post (5 min) — 3 pts

X / LinkedIn / whatever is public:

> Shipped **Lattency** for the @Nimiq Mini Apps Competition — a metro map of
> café wifi across London, Nairobi & SF. Run a verified speed test, earn NIM
> from sponsor bounties, claim from your Nimiq Pay wallet.
>
> https://lattency.vercel.app/
> https://lattency.vercel.app/tour
>
> #Nimiq #MiniAppsCompetition

Copy the post URL into `social_post_url`.

### 6. Submit the form (10 min)

1. https://miniappscompetition.com/submit
2. Paste fields above + video + Skool + social URLs
3. Upload icon, thumbnail, screenshots
4. Include **team lead Nimiq wallet** for prize USDT
5. Submit → confirm the auto-PR appears under `cycle2/thisyearnofear`
6. Watch GitHub Actions on that PR until all checks are green

If a check fails (video private, license flake, demo 5xx), fix and reply on
the PR — maintainers can re-run.

---

## Scorecard map (what judges score after deadline)

| Points | Category | How Lattency hits it |
|---|---|---|
| 45 | Functionality / usefulness | Real speed test, multi-city map, contribute in <60s, no account |
| 25 | Nimiq Pay & NIM | SDK init, sponsor `requestPayment`, claim → on-chain NIM |
| 15 | Real usage | Unique wallets opening the Mini App — share hard after submit |
| 10 | Design & UX | Newsprint/transit UI; `/tour` + first-visit coach for <60s grasp |
| 5 | Builder promotion | Skool + public social links on the form |

Deadline is **not a freeze** — you can keep improving after submit, but the
live Mini App can be judged at any time, so keep prod healthy.

---

## Do not forget

- [ ] Prize payout wallet address on the form
- [ ] Video is **public** (not unlisted if the checker rejects unlisted)
- [ ] No secrets in the repo (`.env.local` stays local — already gitignored)
- [ ] App works on first try inside Nimiq Pay on mobile
- [ ] After submit, ask friends with Nimiq wallets to open the Mini App (usage pts)
