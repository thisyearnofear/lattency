// Test setup — runs before any test module loads.
//
// Hermeticity: Vitest loads `.env.local` (via Vite), which in a working dev
// checkout contains NEXT_PUBLIC_BASE44_APP_ID. That silently flips
// `base44Configured` to true for the whole suite, so unit tests stop reading
// the bundled snapshot and start talking to whatever backend the developer has
// configured. Consequences observed in practice:
//
//   - The Bounty entity allows anonymous reads but not creates. So a read
//     succeeds while a write is denied, and locally-created fixtures become
//     invisible to readers that prefer the remote source. Tests then pass or
//     fail depending on the developer's .env.local.
//   - Worse, a test with valid credentials could write to a real app.
//
// Tests that need the Base44 path must opt in explicitly with
// `vi.mock("@/lib/base44")` and their own configured flag, which keeps the
// decision visible at the call site rather than inherited from the machine.
// `tests/bounty-state-wiring.test.ts` remains the model for env-driven tests:
// it stubs exactly the variables it needs via `vi.stubEnv`.
delete process.env.NEXT_PUBLIC_BASE44_APP_ID;
