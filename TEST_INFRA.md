# Vistar Intake OS — Test Infrastructure & Quality Assurance Architecture

## 1. Overview & Prime Directive
Vistar Intake OS is an AI-verified client onboarding, asset healing, and schema normalization engine. Because the platform processes messy, hostile, and irregular real-world inputs (corrupted spreadsheets, uncalculated Excel formula errors, pixel bombs, formula injection strings, and macro-enabled files), the test infrastructure is built around **opaque-box, requirement-driven verification** spanning 4 rigorous tiers.

---

## 2. Test Architecture & Runner Setup

### 2.1 Test Runners
The project utilizes a dual-engine testing architecture:
1. **Vitest (v3.2.7)**: High-speed, in-memory unit, edge-case, and API integration testing.
   - Environment: `node`
   - Database: Dual-mode Drizzle ORM backed by embedded `@electric-sql/pglite` (WebAssembly C-PostgreSQL) with `resetTestDbSingleton()` per test.
   - Code Coverage: `@vitest/coverage-v8` with text, JSON, and HTML reporters.
   - Configuration: `vitest.config.ts`
   - Include Paths: `tests/unit/**/*.test.ts`, `tests/integration/**/*.test.ts`, `tests/*.test.ts`
2. **Playwright (v1.64.1)**: Full browser-based end-to-end user journeys.
   - Browser: Chromium (pinned to cached binary at `LOCALAPPDATA/ms-playwright/chromium-1234/chrome-win64/chrome.exe`).
   - WebServer: Automated Next.js production server startup via `next start -p 3020 -H 127.0.0.1`.
   - Configuration: `playwright.config.ts`
   - Test Directory: `tests/e2e`

### 2.2 CLI Commands Matrix
| Purpose | Command | Engine | Target |
|---------|---------|--------|--------|
| **Unit & Integration Suite** | `pnpm test` | Vitest | `tests/unit/`, `tests/integration/`, `tests/*.test.ts` |
| **Coverage Report** | `pnpm test:coverage` | Vitest + v8 | `src/lib/**/*.ts`, `app/api/**/*.ts` |
| **Interactive Watch Mode** | `pnpm test:watch` | Vitest | Watch active file changes |
| **Playwright E2E Suite** | `pnpm test:e2e` | Playwright | `tests/e2e/**/*.spec.ts` against port 3020 |
| **Playwright UI Inspector** | `pnpm exec playwright test --ui` | Playwright | Interactive visual test debugging |
| **Typecheck Gate** | `pnpm typecheck` | TypeScript | `tsc --noEmit` across entire repository |
| **Linter Gate** | `pnpm lint` | ESLint | `next lint` zero warnings/errors |

*Note: All commands must be executed from `c:\Users\abhis\Downloads\VIDEO GEN\vistar-intake-os`.*

---

## 3. Four-Tier Testing Methodology

```
+-------------------------------------------------------------------------+
|                      TIER 4: Real-World Scenarios                       |
|   (Full E2E Playwright Journeys: Shopify Catalog, Agency Client Onboarding)   |
+-------------------------------------------------------------------------+
                                    ▲
+-------------------------------------------------------------------------+
|                  TIER 3: Cross-Feature Combinations                     |
|  (Pairwise Pipelines: Chaotic Ingestion + Mapping Memory + Split Export)|
+-------------------------------------------------------------------------+
                                    ▲
+-------------------------------------------------------------------------+
|               TIER 2: Boundary & Hostile Corner Cases                   |
|  (Accounting (500), 1M rows, Macro .xlsm, Corrupt Images, Formula Inj.) |
+-------------------------------------------------------------------------+
                                    ▲
+-------------------------------------------------------------------------+
|                      TIER 1: Feature Coverage                           |
|       (>=5 Happy-path isolated tests per feature across 48 features)     |
+-------------------------------------------------------------------------+
```

### 3.1 Tier 1: Feature Coverage (>=5 tests per feature)
- **Objective**: Verify that every individual capability across the 48 features functions correctly in isolation.
- **Coverage Areas**:
  - Pre-ingestion sanitizer (cell unmerging, banner detection, grand total stripping).
  - Triage normalizer (currency, Indian denominations, SKU formatting, Zod schema validation).
  - Media auto-healer (aspect ratio padding to 1080x1080 WebP, dHash generation, EXIF stripping).
  - Export compilers (PostgreSQL .sql, Markdown, Excel, CSV, JSON, ZIP).
  - Client follow-up generator (WhatsApp, Email, Markdown chaser reports).

### 3.2 Tier 2: Boundary & Hostile Corner Cases (>=5 tests per feature)
- **Objective**: Ensure the system fails gracefully, safely, and cleanly when presented with malformed, hostile, or extreme edge-case inputs.
- **Coverage Areas**:
  - Negative and accounting parenthesis currency: `(500)` and `-1499` rejected as `invalid_format`.
  - Spreadsheet bounds: Merged cell ranges extending to row `1,048,575` clamped without hanging or heap exhaustion.
  - Zero-byte files and corrupt PK zip headers cleanly rejected with descriptive error.
  - Upload security: Block macro spreadsheets (`.xlsm`, `.xltm`, `.xlsb`) and detect MIME spoofing (HTML/JS disguised as PNG).
  - Formula injection: Prepending formula characters (`=`, `+`, `-`, `@`, `\t`, `\r`) with single quotes (`'`).
  - SQL identifier safety: Strict regex validation on table and column names rejecting statement injection (`bad; DROP TABLE users;--`).
  - Markdown escaping: HTML entity escaping (`<`, `>`, `&`) preventing XSS in exported specs.

### 3.3 Tier 3: Cross-Feature Combinations (Pairwise)
- **Objective**: Verify that independent subsystems interact flawlessly when chained together in end-to-end data processing pipelines.
- **Pairwise Combinations**:
  1. *Sanitizer + Mapping Memory*: Chaotic merged headers sanitized -> SHA-256 fingerprint generated -> mapping memory cache hit on repeat upload.
  2. *Normalizer + Diff Table + Incremental Batch Approval*: Dirty rows normalized -> amber diffs preserved -> 1 missing required field flags row -> status marked `partial_approved` -> `verifiedOnly` export excludes invalid row.
  3. *Media Healer + Vision Linking + ZIP Compiler*: Off-ratio photos healed to 1080x1080 -> linked to SKU -> duplicate candidate dropped via dHash + RGB guard -> unique collision-safe filenames generated in ZIP archive.
  4. *Audit Trail + Submissions Lifecycle + Webhook Sandbox*: User edits cell inline -> audit event appended -> bulk approves all healed -> HMAC signed webhook dispatched with verified payload.

### 3.4 Tier 4: Real-World Application Scenarios
- **Objective**: Simulate realistic, unscripted end-to-end user workflows matching production client personas.
- **Scenarios**:
  1. **Shopify D2C Catalog Onboarding**:
     - Client accesses `/intake/shopify-d2c-catalog` via magic link.
     - Uploads chaotic 100-item supplier catalog with merged headers and 25 smartphone product photos.
     - System auto-heals photos to 1080x1080 WebP, flags 2 duplicate shots, and normalizes Indian rupee currencies.
     - Studio console operator filters to "Action Needed", fixes 1 missing stock count inline, approves batch, and exports verified PostgreSQL SQL seed script.
  2. **Agency Client Project Kickoff**:
     - Agency operator sends `/intake/agency-client-kickoff` link with mobile QR code.
     - Client pastes raw messy notes from WhatsApp into dropzone.
     - System normalizes business email, verifies 15-character GSTIN state prefix, and generates client follow-up chaser copy.
     - Webhook HMAC sandbox test dispatches verified payload to agency ERP.

---

## 4. Test Directory Layout
```
tests/
├── unit/
│   ├── security-and-edge-cases.test.ts   # SEC-1 to SEC-7 hostile input tests
│   ├── tier1-feature-coverage.test.ts    # 240+ isolated happy-path tests (>=5 per feature)
│   └── tier2-boundary-corner.test.ts     # 240+ boundary and extreme input tests (>=5 per feature)
├── integration/
│   ├── api-routes.test.ts                # API endpoint contract tests
│   ├── tier3-cross-feature.test.ts       # Pairwise pipeline integration tests
│   └── tier4-scenarios.test.ts           # Programmatic full-journey scenarios
├── e2e/
│   ├── production-flows.spec.ts          # Playwright journeys 1-5
│   ├── tier4-shopify-catalog.spec.ts     # Playwright browser journey: Shopify D2C
│   └── tier4-agency-kickoff.spec.ts      # Playwright browser journey: Agency Kickoff
├── helpers/
│   ├── test-generators.ts                # Synthetic chaotic spreadsheets, corrupt buffers
│   └── assertions.ts                     # Custom assertion matchers (dHash, diffs)
└── intake-engine.test.ts                 # Core data engine suite
```

---

## 5. Verification Checklist & Gates
Before declaring any milestone or deployment complete, the following gates must pass with zero errors:
- [ ] `pnpm typecheck`: 0 TypeScript errors.
- [ ] `pnpm lint`: 0 ESLint errors and 0 warnings.
- [ ] `pnpm test`: 100% pass across all unit, boundary, and integration suites.
- [ ] `pnpm test:coverage`: Core engine coverage (`src/lib/**/*.ts`) maintained >= 90%.
- [ ] `pnpm test:e2e`: All Playwright browser journeys pass cleanly against production build.
