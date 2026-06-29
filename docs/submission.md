# Hackathon submission package

Everything the submission form asks for, in one place. Copy-paste-ready.

---

## Quick facts

- **Live app:** https://lattency.vercel.app/
- **Repo:** https://github.com/thisyearnofear/lattency
- **AWS Database used:** Amazon Aurora PostgreSQL Serverless v2 (engine 16.6, region eu-north-1)
- **Track recommendation:** Open Innovation (also fits Monetizable B2C as a longer-term play)

---

## Where to find your Vercel Team ID

Vercel dashboard → click your team/account name (top-left) → **Settings** → **General** → "Team ID" appears in the "Team Info" section. It's a `team_…` string. Copy and paste into the submission form.

If the project is on a personal account rather than a team, use **Account ID** from the same Settings page.

---

## AWS Console screenshot (submission requirement)

The submission form asks for a screenshot proving AWS Database usage. Use this exact view:

1. AWS Console → **RDS** → **Databases** → click `lattency-dev` (the cluster, not the instance).
2. The Connectivity & security tab shows the endpoint `lattency-dev.cluster-c3oca2mka1ds.eu-north-1.rds.amazonaws.com` and confirms engine `aurora-postgresql 16.6` plus Serverless v2 scaling config (Min 0, Max 2 ACU).
3. Take a full-window screenshot. Crop only enough to remove your browser chrome — leave the AWS Console URL bar visible so judges can see the genuine console.

If the cluster page won't load (Aurora may be auto-paused), refresh once — that wakes it. The page renders fine even with 0 ACUs.

---

## Submission description (form text)

If the form has one long-form field, use this:

> **Lattency** is a crowdsourced metro map of café wifi speeds in Nairobi. Cafés are stations; the three lines are speed tiers — Express (≥50 Mbps), Local (10–49 Mbps), and Suspended (<10 Mbps). Contributors POST a speed measurement; the materialized view that tiers cafés refreshes concurrently, and the next reader sees the line update in real time.
>
> The data spine runs on **Amazon Aurora PostgreSQL Serverless v2** with PostGIS, because the "cafés near me" API uses `ST_DWithin` for geographic radius queries — PostGIS support ruled out DynamoDB and Aurora DSQL. The Serverless v2 cluster scales to 0 ACUs when idle, costing near-zero between visits, and wakes in ~15-30s on the first read. A `cafe_speed_stats` materialized view pre-computes per-café medians and tier classification; `REFRESH MATERIALIZED VIEW CONCURRENTLY` runs after every measurement insert so reads stay close to live without locking the view.
>
> The frontend is **Next.js 16.3 on Vercel**, with a pinned 800vh scroll-driven cinematic SVG map built on GSAP (MotionPath + DrawSVG + ScrollTrigger + quickTo camera tracking). Six theatrical phases tour each line in turn, then a finale zooms out to a constellation of world cities — Lagos, Cape Town, Accra, Kampala, Kigali, plus global peers — to make the "one engine, every city" promise visual. The home page server-component reads from Aurora and is pre-rendered statically with a 60-second revalidate, so the page is fast at the edge and reads are batched.
>
> The same engine would map any city. Nairobi was the first board. The next twelve thousand are next.

If the form has separate "what does it do" / "why" / "how" fields:

**What does it do:**
> Lattency turns crowdsourced café wifi measurements into a metro-map-style network for Nairobi. Cafés are stations, lines are speed tiers, and anyone with a connection can contribute a measurement that updates the map in real time.

**Why did you build it:**
> Finding a café with usable wifi in Nairobi is a guessing game that wastes hours every week. The metro-map metaphor turns scattered, anecdotal speed data into a recognizable transit network at a glance — and the schematic ↔ geographic view toggle shows the same engine could ship to any city the same day.

**Which AWS Database did you use and why:**
> Amazon Aurora PostgreSQL Serverless v2 (engine 16.6, region eu-north-1). PostGIS is the deciding factor — `ST_DWithin` powers the "cafés near me" API endpoint, and that geospatial requirement ruled out Aurora DSQL and DynamoDB. Serverless v2 auto-pauses at 0 ACUs when idle (near-zero idle cost) and warms in ~15-30s, which suits a hackathon demo and would suit a real product launching city-by-city. A materialized view `cafe_speed_stats` pre-computes medians and tiers; `REFRESH MATERIALIZED VIEW CONCURRENTLY` keeps reads close to live without lock contention.

**How is it built (technical):**
> Next.js 16.3 (App Router, RSC) on Vercel; pg.Pool singleton cached on globalThis for serverless-safe connection reuse; Aurora PG Serverless v2 in eu-north-1; TLS-required connection; GSAP 3.15 with MotionPathPlugin + DrawSVGPlugin + ScrollTrigger for the cinematic; CSS-only micro-interactions for the rest. The home page is pre-rendered static with a 60-second revalidate so reads are batched and the edge serves the cached page to most visitors.

---

## Bonus content (LinkedIn / blog / etc. for the optional bonus points)

A short post you can adapt for LinkedIn or dev.to to claim the "publish a piece of content" bonus:

> Built **Lattency** for the Vercel × AWS Databases hackathon — a crowdsourced metro map of café wifi speeds in Nairobi. Cafés become stations, the colored lines are speed tiers, not geography.
>
> The data spine runs on Aurora PostgreSQL Serverless v2 with PostGIS. The "cafés near me" API uses ST_DWithin for spatial queries. A materialized view tiers each café by median speed; REFRESH CONCURRENTLY keeps reads live without locking the view. Aurora scales to 0 ACUs when idle, so a hackathon demo costs near-nothing to run.
>
> The cinematic is the differentiator. Pinned 800vh scroll, six phases, GSAP driving a "camera" along Bezier tier paths. The finale zooms out to a constellation of world cities to make the "one engine, every city" promise visual.
>
> Repo: https://github.com/thisyearnofear/lattency
> Live: https://lattency.vercel.app/
>
> #H0Hackathon

Add `#H0Hackathon` per the official rules so it counts.

---

## Pre-flight checklist before you hit submit

- [ ] Lattency loads at https://lattency.vercel.app/ without errors
- [ ] `/api/cafes/near` returns 12 cafés (curl confirms it)
- [ ] AWS Console screenshot captured, console URL visible
- [ ] Architecture diagram either rendered as PNG (mermaid.live → paste the block) or screenshot of the README rendered on GitHub
- [ ] Vercel Team ID copied from Vercel Settings → General
- [ ] Demo video recorded, edited under 3 minutes, uploaded to YouTube (unlisted is fine)
- [ ] Aurora cluster is not currently mid-pause when video records — visit the live URL once to warm it before recording
- [ ] Bonus content posted (LinkedIn / dev.to / blog) with #H0Hackathon, if going for the bonus

---

## Architecture journey + production roadmap

The demo runs on Aurora PG Serverless v2 reached over TLS from Vercel functions, with port 5432 open to `0.0.0.0/0` to allow Vercel's dynamic egress IPs. This is the hackathon-pragmatic choice; below is the honest path to a production-grade network and what was attempted on the way.

**Attempted: RDS Proxy in front of Aurora.** Built the full stack — dedicated proxy SG, Secrets Manager secret for the master credentials, IAM role with secret-read policy, RDS Proxy targeting the cluster. Discovered RDS Proxy is **VPC-internal by design** — the proxy endpoint resolves to private VPC IPs (172.31.x.x) and is unreachable from outside the VPC without VPC peering, PrivateLink, or a load balancer bridging public traffic in. RDS Proxy is built for in-VPC consumers (Lambda in the same VPC, EC2, ECS) — not for serverless platforms like Vercel that don't share the VPC. Resources have been torn down.

**Production path forward (in order of investment):**
1. **Vercel × AWS Marketplace Aurora integration.** The flagship integration this hackathon promotes — provisions Aurora through the Vercel dashboard with PrivateLink-backed networking. Vercel functions reach Aurora over private link; Aurora is never internet-listening. This is the right answer for a production launch.
2. **Self-managed AWS PrivateLink.** Same architecture, more work — create a VPC endpoint service, expose RDS Proxy through it, set up the consumer endpoint on Vercel's side via partner setup.
3. **NLB + RDS Proxy.** A public-facing Network Load Balancer fronts the proxy. Bridges the VPC-internal proxy to public traffic. Adds ~$16/mo NLB cost and TLS-termination considerations, but doable without re-provisioning.

For this hackathon's scope, Path 1 would have meant re-provisioning Aurora through the Vercel dashboard hours before submission — too risky against a deadline. The open-SG path was the pragmatic choice, with the explicit plan to graduate to Marketplace integration when this becomes a real product.

## Post-submission: revoke the open SG

For the hackathon demo, port 5432 is open to `0.0.0.0/0` so Vercel can reach Aurora. After submission:

```bash
aws ec2 revoke-security-group-ingress \
  --region eu-north-1 \
  --group-id sg-037dded504e25e922 \
  --security-group-rule-ids sgr-01cae09a4cf6ce3c1
```

This removes the open rule. Lattency will stop working from Vercel — which is fine, since the submission is what matters. To keep the demo alive long-term, follow Path 1 above (Vercel × AWS Marketplace Aurora integration).

## Post-submission: extra IAM permissions to revoke

During the RDS Proxy attempt we added `SecretsManagerReadWrite` and `IAMFullAccess` to the `lattency-provisioning` IAM group. Neither is needed any longer:

- AWS Console → IAM → User groups → `lattency-provisioning` → Permissions → detach both policies.

`AmazonRDSFullAccess` and `AmazonEC2FullAccess` can stay (they're what `scripts/provision-aurora.sh` relies on if you ever re-run it) or be detached if you're cleaning up entirely.
