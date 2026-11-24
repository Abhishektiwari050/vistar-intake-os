# Vistar Intake OS

> **AI-Verified Client Onboarding, Asset Healing & Schema Normalization Engine**  
> *INTELLIGENCE FOR WHAT'S NEXT.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-15-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61dafb.svg)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38bdf8.svg)](https://tailwindcss.com/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-0.39-C5F74F.svg)](https://orm.drizzle.team/)
[![Vitest](https://img.shields.io/badge/Vitest-3.0-729B1B.svg)](https://vitest.dev/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)

---

## Overview

**Vistar Intake OS** is an enterprise data ingestion and asset-healing platform designed for agencies, e-commerce networks, and catalog managers. It eliminates the chaos of messy client onboarding by automatically sanitizing unformatted spreadsheets, auto-healing non-standard product imagery, and providing high-confidence column mapping memory.

Built with an **Obsidian-on-Alabaster** architectural minimalist aesthetic, the system provides real-time diff verification, formula injection protection, perceptual image deduplication, and multi-target compilation into clean SQL, Excel, CSV, Markdown, and ZIP deliverables.

---

## Key Capabilities

- **Pre-Ingestion Structural Excel Sanitizer**: Automatically unmerges promotional header banners, detects the true column row, propagates merged category titles downward, strips formula errors (`#REF!`, `#DIV/0!`), and removes summary total rows.
- **Aspect Ratio & Studio Canvas Auto-Healer**: Resizes, centers, and pads non-1:1 product imagery onto a clean 1080x1080 canvas via Sharp, strips EXIF metadata, and converts files into optimized WebP formats.
- **64-bit Perceptual dHash Deduplication**: Generates 16-hex difference hashes to identify duplicate assets while safeguarding genuine color variants using RGB Euclidean distance guards (`meanRgb`).
- **SHA-256 Column Mapping Memory**: Computes normalized header fingerprints and caches approved column mappings for instant 0ms execution on returning client files.
- **Enterprise Security Hardening**: Validates raw magic binary signatures to block MIME spoofing, prevents macro-enabled spreadsheets (`.xlsm`, `.xlsb`), and escapes spreadsheet formula injection characters (`=`, `+`, `-`, `@`).
- **Dual-Mode Persistence**: Seamless zero-config local development using embedded `@electric-sql/pglite` (WebAssembly C-Postgres), and remote clustered PostgreSQL 16 with SSL for production.
- **Multi-Target Export Engine**: Generates verified `.sql` DDL/DML, `.xlsx`, `.csv`, `.md` specifications, `.json`, and packaged `.zip` asset archives.

---

## Architecture & Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Components, Route Handlers)
- **UI Library**: [React 19](https://react.dev/), [Tailwind CSS 3.4](https://tailwindcss.com/), [TanStack Table v8](https://tanstack.com/table)
- **Image Processing**: [Sharp 0.33](https://sharp.pixelplumbing.com/)
- **Spreadsheet Engine**: [SheetJS (xlsx)](https://docs.sheetjs.com/)
- **Database & ORM**: [Drizzle ORM](https://orm.drizzle.team/), `@electric-sql/pglite`, `postgres`
- **Validation**: [Zod](https://zod.dev/)
- **Testing**: [Vitest](https://vitest.dev/), [Playwright](https://playwright.dev/)

---

## Quickstart (Local Development)

### Prerequisites
- Node.js 22 LTS
- pnpm 9+ or 11+

### Installation & Launch
```bash
# Clone repository
cd vistar-intake-os

# Install dependencies
pnpm install

# Start local development server (uses embedded PGlite - zero DB setup needed)
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Production Deployment

### Option 1: Docker Compose (Recommended)
Run the application and PostgreSQL 16 container stack:

```bash
docker compose up -d
```
The application will be accessible at [http://localhost:3000](http://localhost:3000) with health monitoring at [http://localhost:3000/api/health](http://localhost:3000/api/health).

### Option 2: Standalone Production Build
```bash
# Build standalone Next.js bundle
pnpm run build

# Start production server
pnpm run start
```

For complete deployment specifications, Nginx ingress configurations, and database migrations, consult [DEPLOYMENT.md](./DEPLOYMENT.md).

---

## Automated Testing

```bash
# Run unit and integration tests
pnpm test

# Run test suite with coverage report
pnpm test:coverage

# Run Playwright End-to-End tests
pnpm test:e2e

# Run TypeScript type check
pnpm typecheck

# Run ESLint
pnpm lint
```

---

## Operational Documentation

- **[DEPLOYMENT.md](./DEPLOYMENT.md)** — Production architecture, Docker specifications, database migrations, and reverse proxy configuration.
- **[RUNBOOK.md](./RUNBOOK.md)** — Operational runbook, health check probing, log diagnostics, backup/restore procedures, and disaster recovery.
- **[TEST_INFRA.md](./TEST_INFRA.md)** — Comprehensive testing architecture and verification framework.

---

## License

Private & Confidential — Vistar Intake OS. All rights reserved.
