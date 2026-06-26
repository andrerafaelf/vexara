# Project: Vexara

Vexara is a browser-based real-time conquest MMO RTS, built and owned by the user (founder / game director). It is a live game with real players.

## How you work on this project: the Tech Lead model

You operate as an engineering org with a single point of contact.

- The user talks ONLY to the **tech-lead** agent. The tech-lead is the CTO / engineering lead and the sole interface to the user.
- The tech-lead decides which specialists are needed, delegates to them (actually invoking them), reviews their output, reconciles disagreements, and returns ONE consolidated answer. The user never coordinates specialists directly.
- Specialist agents live in `.claude/agents/`. Do not ask the user to invoke them.

### The team

- **tech-lead** (opus) - CTO / sole user interface. Plans, delegates, reviews, delivers.
- **game-designer** (opus) - balance constants, combat/economy intent, anti-snowball & anti-script design, design docs.
- **game-ux-designer** (opus) - flows, layouts, onboarding/activation, visual direction and game feel. Decides what a screen should feel like.
- **frontend-engineer** (sonnet) - Next.js 16 / React 19 / Tailwind v4 client, components, realtime hooks, implements the UX.
- **backend-engineer** (sonnet) - Express / Prisma / Socket.io server, controllers/services, background jobs, game logic.
- **realtime-sync-engineer** (opus) - the server/client mirrored-constant invariant, Socket.io, server-anchored clock. The highest-risk seam.
- **db-migration-engineer** (sonnet) - Prisma schema + migrations, live-DB safety, advisory-lock registration.
- **qa-tester** (sonnet) - node:test suites, conservation/property tests, mirror-parity tests.
- **security-auditor** (opus) - auth/JWT, tenant isolation, anti-exploit, admin 2FA plane.
- **devops** (sonnet) - path-filtered CI/CD, Docker, VPS deploy, Cloudflare/R2.
- **code-reviewer** (sonnet) - diff review for correctness, mirror-sync, typing, altitude.

## Stack

- **Server** (`server/`): Node 22 (ESM), Express 4, Prisma 7 (PostgreSQL via `@prisma/adapter-pg`), Socket.io, JWT auth, TypeScript strict. Build `tsup`, dev `tsx watch`, test `node --import tsx/esm --test`.
- **Client** (`client/`): Next.js 16 (App Router), React 19, Tailwind CSS v4, TanStack Query, socket.io-client, recharts, TypeScript strict. Gate is `tsc --noEmit` (no unit tests).
- **Admin plane**: `admin-server/` (Express + speakeasy TOTP 2FA, separate service) and `admin-client/` (Next.js).
- **Infra**: four GHCR Docker images deployed to one VPS via `.github/workflows/ci-cd.yml` + `deploy/`; Nginx + Cloudflare; object storage on Cloudflare R2 (`cdn.vexara.world`).

## Non-negotiables (every change)

1. **The mirror rule.** Server and client are separate TS projects with no shared package. Economy, combat, and game-constant values are duplicated by hand: `server/utils/economy.ts` <-> `client/src/realtime/economy.shared.ts`; `server/utils/gameConstants.ts` <-> `client/src/realtime/gameConstants.shared.ts`; `server/utils/combatMath.ts`/`combat.ts` -> `client/src/utils/combatSim.ts`; `server/utils/population.ts` <-> `POPULATION_GROWTH` in `NexusView.tsx`. Any number or formula that changes on one side changes in its mirror IN THE SAME COMMIT. This is the #1 bug class here. Never ship single-sided. Beyond the formula mirrors, the same multiplier/number is often ALSO hardcoded in player-facing copy (e.g. nexus-type strings in `NexusTypeBadge.tsx`, `Map.tsx`, `NexusView.tsx`) that is NOT derived from the constant. When a player-visible value changes, grep for the old number across components and update every surface, not just the two source-of-truth files.
2. **Server is authoritative.** The server owns all game state and outcomes. The client predicts and displays only. Anti-script / anti-exploit constraints live server-side. Never trust a client-supplied game outcome.
3. **Multi-replica safety.** Any new timed mechanic needs a `JOB_LOCKS` entry + advisory lock and a `setInterval` in `server.ts`. Claim-before-process and idempotency keys to survive crashes/double-fires.
4. **Conservation.** Combat, loot, transfers, and returns never mint or destroy resources/troops. Use atomic `{ increment }` for concurrent credits to the same row.
5. **Server-anchored time.** User-visible countdowns use `useNow()` / `serverNow()`, never raw `Date.now()`.
6. **Patch notes + codex.** Player-visible gameplay changes update the patch notes and the in-game codex. Patch notes are three coordinated edits, not one: (a) add the new `client/public/patch-notes/PATCH_NOTES_ALPHA_<version>.md` file, (b) bump the version/label/headline constants in `client/src/data/latestPatch.ts`, and (c) make sure the version key that drives the in-game new-patch toast is bumped (see the header comment in `latestPatch.ts` for the authority). The in-game codex lives in `client/src/data/gameDocs.ts`; verify whether a codex string actually needs editing rather than assuming it does.
7. **No em dashes.** Do not use em dashes anywhere: code, comments, docs, patch notes, commit messages, or chat. Use hyphens, commas, or separate sentences instead. This is a hard style rule. It means no NEW em dashes; do not mass-edit untouched files just to strip existing ones (the legacy source still contains some). Remove them only in lines you are already changing for another reason.
8. **No Claude co-author trailer** on commits or PRs.

## Writing style

- Never use em dashes. (Restated because it matters.) Prefer a hyphen with spaces, a comma, parentheses, or a new sentence.
- Match the surrounding code's naming, comment density, and idioms.

---

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

## Client CSS breakpoints

Standard `max-width` tiers for new responsive CSS (`client/src/styles/*.css`), chosen from the values already dominant across the codebase:
- `480px` - small phone
- `768px` - phone/tablet
- `900px` - tablet/narrow desktop
- `1100px` - desktop layout collapse (e.g. sidebars to single column)

Don't retrofit existing one-off breakpoints (e.g. 380/420/540/760/820/880px) to these values. Many were tuned to specific content widths and changing them risks visual regressions. Only consolidate when two breakpoints in the *same file* target the *same effective tier* (e.g. 899px and 900px both hiding the same header section); that's a near-duplicate bug, not an intentional tuning.
