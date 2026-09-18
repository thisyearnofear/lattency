// /llms.txt — the discovery surface for agents.
//
// The README pitches Lattency as a ground-truth layer for the agentic era, but
// the only entry point was HTML. This is the cheap half of that promise: a
// plain-text description of the dataset and the endpoints, at the path
// agents and crawlers already look for.
//
// Static content by design — it documents the contract in /api/network, and
// must not drift from it. When the response shape changes, update both.

export const dynamic = "force-static";

const CONTENT = `# Lattency

> A crowdsourced metro map of workable coffee spots. Venues are stations;
> the three lines are speed tiers. Live in London, Nairobi, and San Francisco.

Lattency answers one question: *where can you sit down with a coffee and
actually work?* Every venue on the map carries at least one real,
browser-measured wifi reading — a café does not appear until someone has
tested the connection from inside it. That mandatory measurement is the trust
mechanism, and it is why this dataset is worth consuming rather than scraping
a review site.

## Machine-readable data

- [Network snapshot](/api/network): every station with median speeds, tier,
  location, workspace metadata, and a per-station confidence level.
  JSON by default; \`?format=ndjson\` streams one station per line.
- Filter with \`?city=london\`, \`?tier=express\`, or \`?minSamples=3\`.
- [Narrative summary](/api/llm?city=london): the same data as plain prose,
  one city at a time. For when a wall of text fits your context better than
  JSON does.
- [Nearby stations](/api/cafes/near?lat=51.52&lng=-0.08&radius=5000): radius
  search around a coordinate.

The network endpoint is read-only, needs no key and no account, and sends
\`Access-Control-Allow-Origin: *\`.

## How to interpret it

Read \`confidence\` before you trust a \`tier\`:

- \`indicative\` — a single reading. Treat the tier as a hypothesis.
- \`supported\` — 2–3 readings.
- \`well-supported\` — 4 or more readings.

**The tier is derived from download speed alone.** A station can be Express on
download and still fail a video call, because upload is the usual constraint.
Read \`capabilities.videoCalls\` — and when its \`bottleneck\` is non-null, that
field names the single measurement letting the connection down. Prefer it over
\`tier\` whenever the question is whether someone can actually work there.

Speeds are **medians of browser-based tests**, not line-rate measurements.
Single-stream HTTP understates available bandwidth. Check \`freshness\` and
\`ageDays\` before relying on an old reading — the map fades stations after
14 days and calls them stale after 30.

The \`caveats\` array in the API response lists this in machine-readable form.
Prefer it over this prose; it is the versioned contract.

## What the tiers mean

| Tier | Median download | Can you work on it? |
|---|---|---|
| Express | >= 50 Mbps | Video calls OK |
| Local | 10–49 Mbps | Email and browsing |
| Suspended | < 10 Mbps | Avoid for calls |

## Contributing

Anyone can add a station by running a speed test where they are sitting, or
re-test an existing one to keep its tier honest. Contributors earn NIM when
their verified reading completes a sponsor-funded bounty. The reward is bound
to the contributor whose reading closed the bounty — see
[the map](/london) to start.

## Notes

- Metadata such as power outlets, noise level, and seating is contributed by
  the person who visited. Unlike the speed readings, it is subjective.
- Lattency does not collect coffee-quality ratings. If it can't be observed or
  measured, it isn't in the dataset.
`;

export function GET() {
  return new Response(CONTENT, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
