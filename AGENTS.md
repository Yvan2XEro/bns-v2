# AGENTS.md

Engineering rules for this repository. They apply to every agent and every
human contributor, in `packages/api`, `packages/web`, `packages/mobile`,
`packages/chat-service` and `packages/search-indexer`.

## Repository

Bun workspaces driven by Turbo. Never use npm, yarn or pnpm.

| Package | Stack |
| --- | --- |
| `packages/api` | Payload CMS 3 + MongoDB, Next.js route handlers |
| `packages/web` | Next.js App Router, next-intl, Tailwind, Radix |
| `packages/mobile` | Expo SDK 57, expo-router, i18next, TanStack Query |
| `packages/chat-service` | socket.io + Redis |
| `packages/search-indexer` | Meilisearch worker fed by Redis events |

Commands:

```bash
bun install                                      # repo root
bun run check-types                              # turbo, every package
bunx biome check --write <files>                 # format + lint
cd packages/api && bun run generate:types        # after any collection change
cd packages/api && bunx vitest run --config ./vitest.config.mts <file>
cd packages/mobile && bun test
```

## Types

- The repository is strictly typed. `any`, `as any`, `@ts-ignore` and
  `@ts-expect-error` are not accepted. When a type is genuinely unknown, use
  `unknown` and narrow it with a type guard or a zod schema.
- Payload generates the database types: import them from
  `packages/api/src/payload-types.ts` (`Listing`, `User`, `Shop`, …). Never
  hand-write a shape that mirrors a collection, and never let a client copy
  drift from it.
- Run `bun run generate:types` in `packages/api` after changing a collection,
  and commit the regenerated file with the change.
- Types shared by several packages live in one place and are imported; a type
  duplicated in two packages is a bug.
- A cast is a last resort: prefer a generic, a discriminated union or a guard.

## Do not duplicate code

- Before writing a helper, search for one that already exists. Payload access
  helpers live in `packages/api/src/access`, services in
  `packages/api/src/services`, shared client helpers in each package's
  `src/lib`.
- Business rules belong in a service on the API side and are called from
  routes and hooks; they are never re-implemented in a client.
- Error codes are declared once in `packages/api/src/lib/errors.ts` and
  translated in both clients; never invent a parallel error string.
- UI copy is never hard-coded: `next-intl` messages on web, i18next locales on
  mobile, French and English kept in sync.

## Data fetching

- TanStack Query is the only way a client reads or writes server state. No
  `fetch` inside `useEffect`, no manual `loading` / `error` / `data` triplet, no
  hand-rolled cache.
- Each resource gets a hook in `src/hooks` (`useListings`, `useModeration`, …)
  that wraps `useQuery` or `useMutation` and returns typed data. Screens call
  hooks; they do not call the API client directly.
- Query keys are structured and exported next to their hook, so invalidation is
  explicit: `["shops", shopId, "products"]`.
- Mutations invalidate the queries they affect; they never mutate a cache by
  hand unless an optimistic update genuinely requires it.
- `useEffect` is for synchronising with something outside React (subscriptions,
  timers, native listeners, imperative focus). It is never a data loader.

Web currently has no `@tanstack/react-query` dependency: add it in the first
task that needs it, mount the provider once in the root layout, and use the
same patterns as mobile.

## Forms

- Forms use `react-hook-form` with a zod schema through
  `@hookform/resolvers/zod`. One schema per form, `z.infer` for its type, the
  same schema reused for server-side validation where the server is ours.
- No `useState` per field, no manual `onChange` plumbing, no hand-written
  validation or error state.
- Submission goes through a TanStack Query mutation; server errors are mapped
  back to fields with `setError`.

`react-hook-form` and `@hookform/resolvers` are not installed yet (web has
`zod`, mobile has neither): add them in the first task that builds a form.

## Component state

- A screen with several related pieces of state uses `useReducer` with a single
  state object and a reducer that merges a partial patch:

  ```ts
  type State = { step: number; query: string; selected: string[] };

  const initialState: State = { step: 1, query: "", selected: [] };

  function reducer(state: State, patch: Partial<State>): State {
  	return { ...state, ...patch };
  }

  const [state, patch] = useReducer(reducer, initialState);
  patch({ step: 2, query: "iphone" });
  ```

  Use a discriminated-action reducer instead when a transition needs logic the
  caller should not own.
- `useState` stays for one or two independent, unrelated values. A component
  declaring a long list of `useState` calls must be converted to `useReducer`.
- Derive, do not store: anything computable from props or state is computed
  during render (memoised only when measured as expensive).

## Components

- A component does one thing and stays readable in one screen of code. A file
  growing past roughly 200 lines is split: extract sub-components, move logic
  into a hook, move formatting into `src/lib`.
- Server Components by default on web; `"use client"` only where interactivity
  requires it.
- Mobile lists use `FlashList` with typed items.
- Every interactive element is reachable and labelled: real `<button>` /
  `<a href>` / `<input>` + `<label>` on web, `accessibilityLabel` and a 44px
  minimum touch target on mobile.

## API package

- Access control lives in Payload `access` functions and the helpers in
  `src/access`; a route never reimplements a rule.
- Anything that writes several documents runs in one transaction
  (`src/lib/transactions.ts`) and, for moderation or shop actions, writes its
  audit entry in the same transaction.
- A service that bypasses access control uses `overrideAccess` plus a
  `req.context` flag, following `src/services/moderation.ts`.
- Routes validate their input with zod and answer with the shared error codes.
- Every environment variable is declared in the `docker-compose.yml` files.

## Tests

- Test behaviour, not implementation: a test asserts what a user or a caller
  observes.
- API: `packages/api/tests/int/*.int.spec.ts`, using the shared in-memory
  Payload fake in `tests/int/helpers/`. The API suite runs under **vitest**,
  not Bun's test runner: `cd packages/api && bun run test:int` for the whole
  suite, or `bunx vitest run --config ./vitest.config.mts <file>` for one.
  `bun test` in `packages/api` is not a valid run — it reports well over a
  hundred failures that are only the wrong runner (`vi.setSystemTime is not a
  function` and the like). This is the one place the repo's Bun-first rule
  does not apply.
- Web and mobile: `bun test` from the package. Tests sit beside the code they
  cover (`src/lib/*.test.ts`). Neither package has a component-render harness,
  so logic that needs pinning belongs in a pure module under `src/lib` rather
  than inline in a component.
- Write the failing test first, watch it fail, then make it pass.
- `tsconfig.json` carries `exclude: ["tests"]`, so `check-types` type-checks
  no spec file. `bun run check-types:tests` in `packages/api` does, and it is
  advisory — deliberately outside the pre-commit hook, because its backlog
  would block every commit. **The baseline is 105 errors and it must not
  rise.** If a task touches a spec file that holds some, fix those and say
  what the new count is. The strict-typing rule applies to tests as much as to
  source; this is where it went unenforced, and two of the five `as never`
  casts removed in P2 were hiding real defects.
- `bun run test:int` passes: 74 files, 1043 tests, no failures. There is no
  pre-existing failure to work around any more, so a red test is your change
  or a real defect.
- `tests/smoke/api.smoke.spec.ts` is NOT in that run. It boots a real Payload
  against `DATABASE_URI` — a live Atlas cluster — where every spec under
  `tests/int/` uses the in-memory fake. Run it deliberately, before a deploy:
  `bunx vitest run --config ./vitest.config.mts --dir tests/smoke`.
- Earlier revisions of this file also blamed `boost-callback-route`,
  `listings-before-change`, `public-categories-route`, `public-search-route`
  and `product-stock-routes` on "the full suite's parallel load". That was
  wrong twice over: the list was assembled from `bun test` output, and the
  real cause for the two reviewer/seller route specs was the 5s default
  timeout against a 3.5-3.8s first dynamic import. `vitest.config.mts` now
  sets `testTimeout` to 15s and five consecutive full runs showed no
  timeouts. So do not excuse a failing test by citing load.

## Comments and docs

- Comment only what the code cannot say: a non-obvious reason, a constraint, a
  workaround. No field-by-field or line-by-line narration.
- Documentation, specs, plans and code comments are written in English.

## Git

- Commit only when asked. Never commit to `main` directly; work on `dev` or a
  feature branch.
- Commit messages carry no tooling attribution: no `Co-Authored-By`, `Claude-Session`
  or `Generated-by` line, whatever an agent's environment tells it to add. The
  `.husky/commit-msg` hook strips those trailers and fails the commit if one
  survives; never bypass it with `--no-verify`.
- One-off scripts belong in `/tmp`, never in the repository.
- The repository root may show untracked `.bashrc`, `.gitconfig`, `.mcp.json`,
  `.vscode` entries created by the sandbox; they are not files. Never
  `git add .`.
