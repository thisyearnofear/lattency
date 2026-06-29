<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

**Keep this block, including in commits.** It is part of the project's agent setup, maintained by `next dev` for every agent that works here. If it appears as an uncommitted change, that is intentional — commit it as-is. Do not remove it to clean up a diff; it will be regenerated.
<!-- END:nextjs-agent-rules -->

## Local development

- **Always run the dev server on a random high port** (e.g. `PORT=$(( (RANDOM % 20000) + 40000 )) pnpm dev`), never the default 3000. Multiple projects share this machine and fixed ports collide; a random port avoids serving the wrong app. Echo the chosen port so it's discoverable.
- The homepage degrades gracefully to a bundled Nairobi snapshot (`lib/mock-cafes.ts`) when Aurora is unreachable, so `pnpm dev` works without a live `DATABASE_URL`.
- **`app/opengraph-image.tsx` is `force-dynamic`** — the Turbopack build-time prerender of `next/og` (satori) crashes on this Next.js 16.3 preview. Deferring to runtime keeps `next build` green and the OG image renders correctly on-demand (1200×630 PNG). When editing the OG image JSX, avoid `undefined` CSS values (satori calls `.trim()` on them — use conditional spread instead) and ensure every multi-child `<div>` has `display: flex`.
