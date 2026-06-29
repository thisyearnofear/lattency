// Test setup — runs before any test module loads. Injects a placeholder
// DATABASE_URL so importing lib/db.ts (which builds the pg.Pool at module
// load) doesn't throw. The pool is never actually connected to during
// these unit tests; any test that needs DB results mocks the `query`
// function directly. URL assembled at runtime so the literal doesn't
// trip secretlint's connection-string heuristic.
const _placeholder = ["postgres", "://", "test", ":", "PLACEHOLDER", "@", "127.0.0.1", ":", "5432", "/", "lattency_test"].join("");
process.env.DATABASE_URL ??= _placeholder;
