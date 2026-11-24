# Vistar Intake OS — Production Deployment & Operations Guide

This guide provides comprehensive architectural specifications, container deployment procedures, database migration instructions, and reverse-proxy configurations for running **Vistar Intake OS** in mission-critical production environments.

---

## 1. System Architecture

Vistar Intake OS is architected as a high-throughput, secure asset healing and spreadsheet intake platform.

```
                    ┌────────────────────────┐
                    │      Client Browser    │
                    │ (Next.js 15 App Router)│
                    └───────────┬────────────┘
                                │ HTTPS / WSS
                                ▼
                    ┌────────────────────────┐
                    │  Reverse Proxy / Ingress│
                    │  (Nginx / Cloudflare)  │
                    │  Max Body: 50MB        │
                    └───────────┬────────────┘
                                │ HTTP :3000
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│               Vistar Intake OS Standalone Container            │
│                                                                 │
│  ┌───────────────────────┐         ┌─────────────────────────┐  │
│  │  App Router UI        │         │ Route Handlers          │  │
│  │  - Studio Console     │         │ - /api/intake           │  │
│  │  - Magic Dropzone     │         │ - /api/health           │  │
│  │  - Diff Inspector     │         │ - /api/mapping-memory   │  │
│  └───────────────────────┘         └───────────┬─────────────┘  │
│                                                │                │
│  ┌─────────────────────────────────────────────▼─────────────┐  │
│  │ Pipeline Core                                             │  │
│  │ - Pre-Ingestion Excel Structural Sanitizer                │  │
│  │ - Sharp 1080x1080 Aspect Ratio Auto-Healer                │  │
│  │ - 64-bit dHash Perceptual Deduplicator                    │  │
│  │ - SHA-256 Mapping Memory Cache (0ms re-mapping)           │  │
│  │ - Multi-Target Export Engine (.sql, .xlsx, .csv, .zip)    │  │
│  └──────────────────────────────┬────────────────────────────┘  │
│                                 │ Drizzle ORM                   │
└─────────────────────────────────┼───────────────────────────────┘
                                  │
                  ┌───────────────┴───────────────┐
                  ▼                               ▼
       ┌──────────────────────┐       ┌───────────────────────┐
       │   Local Dev / Test   │       │  Production Database  │
       │  @electric-sql/pglite│       │ PostgreSQL 16 Cluster │
       │  (Embedded WASM DB)  │       │ (AWS RDS / Supabase)  │
       └──────────────────────┘       └───────────────────────┘
```

---

## 2. Prerequisites & Resource Requirements

| Component | Minimum Specification | Recommended Production |
|---|---|---|
| **CPU** | 1 vCPU (x86_64 or arm64) | 2+ vCPU |
| **RAM** | 1 GB | 2 GB to 4 GB (handles Sharp concurrent batch healing) |
| **Disk** | 5 GB SSD | 20+ GB SSD |
| **Runtime** | Node.js 22 LTS or Docker 24+ | Docker Compose v2+ / Kubernetes |
| **Database** | Embedded PGlite (zero config) | PostgreSQL 16+ (AWS RDS, Supabase, Neon) |

---

## 3. Environment Configuration

All environment variables are validated at runtime via Zod (`src/lib/env.ts`). Invalid configurations fail fast on container startup with structured diagnostics.

Create a production `.env.production` file:

```bash
# Server Runtime
NODE_ENV=production
PORT=3000
HOSTNAME=0.0.0.0

# Database Persistence
DATABASE_URL=postgresql://vistar_user:secure_password@db-host.internal:5432/vistar_intake
DATABASE_SSL=true

# AI & Multimodal Intelligence (Optional fallback for chaotic spreadsheets)
GEMINI_API_KEY=your_gemini_api_key_here

# Outbound Webhook Security (Optional)
WEBHOOK_SIGNING_SECRET=your_32_byte_hmac_secret_key
```

### Environment Variable Reference

| Variable | Type | Default | Description |
|---|---|---|---|
| `NODE_ENV` | `'development' \| 'production' \| 'test'` | `'development'` | Runtime environment tier |
| `PORT` | Numeric String | `'3000'` | HTTP port for server binding |
| `HOSTNAME` | String | `'0.0.0.0'` | Interface address (use `0.0.0.0` in containers) |
| `DATABASE_URL` | PostgreSQL URL String | `undefined` | Remote PostgreSQL connection string. If omitted, embedded PGlite is used |
| `DATABASE_SSL` | `'true' \| 'false'` | `'false'` | Enables TLS with `{ rejectUnauthorized: false }` for cloud DBs |
| `GEMINI_API_KEY` | String | `undefined` | Google Gemini API key for semantic matching and multimodal vision fallback |
| `WEBHOOK_SIGNING_SECRET`| String | `undefined` | HMAC-SHA256 secret for signing outbound webhook payloads |

---

## 4. Container Deployment (Docker & Compose)

### 4.1 Multi-Stage Standalone Build
Build the optimized standalone Docker image:

```bash
docker build -t vistar-intake-os:latest .
```

The Dockerfile uses a 4-stage architecture:
1. **`base`**: `node:22-alpine` with `libc6-compat` and Corepack pnpm enabled.
2. **`deps`**: Resolves dependencies using `pnpm install --frozen-lockfile`.
3. **`builder`**: Compiles standalone Next.js bundle (`.next/standalone`) and static assets.
4. **`runner`**: Minimal unprivileged image running as user `nextjs` (UID 1001), exposing port 3000 with a built-in health check.

### 4.2 Docker Compose Production Stack
Deploy the full stack including PostgreSQL 16 with a single command:

```bash
docker compose up -d
```

Verify service health:
```bash
docker compose ps
```

Check real-time application logs:
```bash
docker compose logs -f app
```

---

## 5. Database Schema & Migration Management

Vistar Intake OS employs **idempotent DDL execution** combined with Drizzle ORM:

1. **Automatic Bootstrapping**:
   On every startup, `initDatabase()` executes `SCHEMA_DDL` containing `CREATE TABLE IF NOT EXISTS` statements for:
   - `blueprints`: Validation schemas, alias catalogs, and media rules.
   - `mapping_memory`: SHA-256 header fingerprint caches with hit counter.
   - `submissions`: Ingested records, cell diff audit events, and healing stats.
   - `webhooks`: Outbound notification endpoints.
2. **Schema Push**:
   To push schema modifications directly to a production PostgreSQL database:
   ```bash
   pnpm exec drizzle-kit push
   ```
3. **Default Blueprints**:
   If the `blueprints` table is empty, the database seeds the default industry blueprints automatically:
   - `shopify-catalog`: E-commerce catalog normalization (SKU, title, price, stock, image rules).
   - `agency-kickoff`: Client intake and media onboarding.

---

## 6. Remote PostgreSQL & SSL Setups

When connecting to cloud-managed PostgreSQL providers, set `DATABASE_SSL=true`.

### Supabase
- Use Transaction Mode (port `6543`) or Session Mode (port `5432`).
- Example: `DATABASE_URL=postgres://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`
- Set `DATABASE_SSL=true`.

### AWS RDS / Aurora
- Point `DATABASE_URL` to the RDS instance or RDS Proxy endpoint.
- Ensure security group allows ingress from the application container IP on port 5432.
- Set `DATABASE_SSL=true`.

### Neon Serverless
- Example: `DATABASE_URL=postgres://user:pass@ep-cool-name-123456.us-east-2.aws.neon.tech/vistar_intake?sslmode=require`
- Set `DATABASE_SSL=true`.

---

## 7. Reverse Proxy & Ingress (Nginx)

Place an Nginx reverse proxy in front of Vistar Intake OS to terminate SSL and support large media file uploads:

```nginx
server {
    listen 443 ssl http2;
    server_name intake.vistar.internal;

    ssl_certificate     /etc/ssl/certs/vistar.crt;
    ssl_certificate_key /etc/ssl/private/vistar.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    # Mandatory: Allow batch image uploads and multi-sheet Excel files
    client_max_body_size 50M;

    # Timeouts for batch image auto-healing
    proxy_read_timeout 120s;
    proxy_connect_timeout 30s;
    proxy_send_timeout 120s;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Dedicated fast-path for health probes
    location = /api/health {
        proxy_pass http://127.0.0.1:3000/api/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        access_log off;
    }
}
```

---

## 8. Rollback & Disaster Recovery Procedures

1. **Application Rollback**:
   To immediately rollback to a previous container version:
   ```bash
   docker stop vistar-intake-app
   docker run -d --name vistar-intake-app -p 3000:3000 --env-file .env.production vistar-intake-os:<previous-tag>
   ```
2. **Database Rollback**:
   Restore from automated daily dumps using `pg_restore` (see `RUNBOOK.md`).
