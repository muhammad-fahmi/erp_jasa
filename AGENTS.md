# AGENTS.md — erp_jasa

## Status

Working Vite SPA. Core WO vertical slice is done and verified: intake → antrean → task per stage → QC gate → serah-terima → bayar → tutup. Domain logic lives in `src/services/domainEngine.ts` (pure functions, no React); views consume it through `src/context/ErpContext.tsx` (in-memory store, seeded by `src/data/seedData.ts`).

`PRD.md` (845 lines, Bahasa Indonesia, 18 sections) remains the source of truth for scope and rules.
**Docs are Indonesian — keep any new spec/prose in Indonesian.** Code identifiers stay English.

## Read PRD.md before writing code

Non-obvious decisions that are already settled and would otherwise be re-litigated:

- **`WorkOrder` (WO) is the transactional backbone — NOT `SalesOrder`.** A job routes through stages, stations, technicians, QC. Do not model this as a goods-selling ERP.
- **Stack in PRD Section 3 is explicitly "Rekomendasi Arsitektur", not binding.** PRD deliberately targets framework-agnostic design. Do not treat Next.js/Prisma/Redis as already chosen — confirm before scaffolding.
- **PRD Section 6 is the schema contract**: raw PostgreSQL DDL (~20 tables, 8 enums). Mirrors it directly in whatever ORM you pick.
- **Status enum has exactly 10 values**, and `ON_HOLD` / `REWORK` are exit paths that must return to `IN_PROGRESS`. PRD Section 8 holds the legal transition table — treat it as authoritative, don't invent transitions.
- **RBAC is 7 roles** (PRD Section 4: `OWNER`, `SUPERVISOR`, `FRONT_DESK`, `TECHNICIAN`, `QC`, `PARTS`, `FINANCE`). Technicians must never see prices, parts cost, or margin — that's the one constraint with legal/commercial teeth. Staff `PARTS` mengelola pemasok, PR, PO, GRN, transfer, dan opname stok. Role `FINANCE` mencatat pembayaran ke pemasok (AP).
- **Out of scope (PRD Section 2.2)** — do not build: double-entry GL (jurnal ganda akuntansi penuh), statutory payroll formal (BPJS/PPh 21), e-Faktur pajak DJP, 3-way matching berbasis faktur pajak, native mobile apps, inbound WhatsApp bot. Pengadaan part/bahan operasional (PR, PO, GRN, Retur Pemasok, Transfer Stok Antar-Cabang, dan status pembayaran AP sederhana) adalah **IN-SCOPE** per PRD v1.1. Part dikonsumsi untuk pengerjaan WO, bukan dijual eceran terpisah.
- **Presets are config, not forks** (PRD Section 16): laundry vs workshop differs only in master data, not code.

## Conventions inherited from sibling projects

Verified across `erp_retail`, `erp_sparepart`, `wms-app`:

- **Vite + React, not Next.js.** Both existing ERP siblings shipped Vite SPAs even though their PRDs recommended Next.js. `erp_jasa` has no code yet, so pick deliberately rather than by assumption.
- **Lint is `oxlint`, not ESLint** (`.oxlintrc.json`, plugins `react` + `typescript` + `oxc`).
- **Tailwind v4 via the `@tailwindcss/vite` plugin** — no `tailwind.config.js`.
- **`erp_retail` backend pattern**: Vite dev server + separate `express` + `pg` `Pool` in `server/`, Postgres via `docker-compose` (`postgres:16-alpine`, init SQL mounted to `docker-entrypoint-initdb.d`). Reuse this split rather than inventing a new one.
- **No test framework anywhere in the portfolio.** There is no test command to guess at. If you add tests, also add the script.

## Writing large files on this Windows host

Three failures hit while producing `PRD.md`. All are reproducible:

- **Heredocs (`<< 'EOF'`) truncate silently** around 8KB and mangle content. Don't use them for docs.
- **`bash -c` with a long multi-line payload fails `ENAMETOOLONG` / `unexpected EOF`** (~90KB+). Inline scripts hit Windows CLI arg-length limits.
- **Backticks inside double-quoted `python -c` / `node -e` strings get command-substituted by bash**, silently deleting the backticked token from the output file.

Working approach: `write` the first chunk, then `edit` to append. Keep each payload well under ~25KB. Markdown with code fences and backticks goes through the `write`/`edit` tools, never through a shell.

## Verification

```
npm run lint        # oxlint (react/purity off; only-export-components warns on the context file)
npm run typecheck   # tsc --noEmit
npm test            # node --experimental-strip-types, no test framework installed
npm run build
```

`npm test` runs raw TypeScript through Node's type-stripping, so engine imports must carry an explicit `.ts` extension (`import ... from './domainEngine.ts'`) and type-only imports must use `import type`. This is the one place the build does not go through a bundler.