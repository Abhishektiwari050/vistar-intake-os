# Vistar Intake OS — Operational Incident Runbook

This runbook outlines operational procedures, health check probing, log diagnostics, database maintenance, and disaster recovery playbooks for **Vistar Intake OS**.

---

## 1. Incident Classification & SLAs

| Severity | Definition | Examples | Response SLA | Target Resolution |
|---|---|---|---|---|
| **P1 — Critical** | Complete service outage or core pipeline failure | `/api/health` returns HTTP 503; database connection pool failure; container crash loops | 15 minutes | < 1 hour |
| **P2 — Major** | Degraded functionality or batch processing failure | Sharp image healing failing (OOM); Excel sanitizer crashing on specific files; webhook delivery stopped | 30 minutes | < 4 hours |
| **P3 — Minor** | Non-blocking issues or minor anomalies | Mapping memory cache misses; cosmetic UI diff alignment; export formatting warning | 4 hours | < 24 hours |

---

## 2. Health Monitoring & Probing

Vistar Intake OS exposes a real-time production health monitoring endpoint at `/api/health`.

### 2.1 Health Check Probe (`GET /api/health`)

#### Normal Healthy Response (HTTP 200)
```json
{
  "status": "healthy",
  "uptimeSeconds": 1420.5,
  "timestamp": "2026-11-12T02:30:00.000Z",
  "database": {
    "status": "connected",
    "latencyMs": 2.4
  },
  "memory": {
    "heapUsedMb": 68.2,
    "rssMb": 115.6
  },
  "version": "1.0.0"
}
```

#### Degraded Response (HTTP 503)
```json
{
  "status": "degraded",
  "uptimeSeconds": 1425.1,
  "timestamp": "2026-11-12T02:30:05.000Z",
  "database": {
    "status": "disconnected",
    "latencyMs": -1,
    "error": "Connection terminated unexpectedly"
  },
  "memory": {
    "heapUsedMb": 72.1,
    "rssMb": 119.0
  },
  "version": "1.0.0"
}
```

### 2.2 Alert Thresholds
- **Database Latency**: Warning if `latencyMs > 50ms`; Critical if `latencyMs > 250ms` or status is `disconnected`.
- **Memory Consumption**: Warning if `heapUsedMb > 400MB`; Critical if `rssMb > 1200MB`.
- **Health Check Failures**: Trigger P1 alert if 3 consecutive health probes return HTTP 503 or fail to respond within 5 seconds.

---

## 3. Real-Time Diagnostics & Log Inspection

### 3.1 Container Log Commands
```bash
# Stream real-time logs with timestamps
docker logs -f --tail 100 --timestamps vistar-intake-app

# Search for runtime errors and unhandled exceptions
docker logs vistar-intake-app 2>&1 | grep -iE 'error|exception|failed|fatal'

# Inspect environment validation failures
docker logs vistar-intake-app 2>&1 | grep -A 5 'Invalid environment configuration'
```

### 3.2 Inspecting Active Submissions
Connect to the database and query recent submission statuses:
```bash
docker exec -it vistar-intake-db psql -U postgres -d vistar_intake -c \
  "SELECT id, blueprint_slug, client_name, status, created_at FROM submissions ORDER BY created_at DESC LIMIT 10;"
```

---

## 4. Database Maintenance, Backup & Recovery

### 4.1 Daily Automated Backup (`pg_dump`)
Execute a compressed binary backup:
```bash
BACKUP_FILE="/backups/vistar_intake_$(date +%Y%m%d_%H%M%S).dump"
docker exec -t vistar-intake-db pg_dump -U postgres -d vistar_intake -Fc -v -f "$BACKUP_FILE"
```

### 4.2 Database Restore (`pg_restore`)
To restore from a backup file:
```bash
# Clean existing tables and restore state
docker exec -i vistar-intake-db pg_restore -U postgres -d vistar_intake -v -c --if-exists < /backups/vistar_target.dump
```

### 4.3 PGlite Local Storage Backup
If running in embedded PGlite mode (zero external database):
```bash
# Archive local embedded database files
tar -czvf /backups/pgdata_$(date +%Y%m%d).tar.gz ./data/intake_pgdata/
```

### 4.4 Index Maintenance & Vacuuming
Run monthly index maintenance:
```sql
VACUUM ANALYZE submissions;
VACUUM ANALYZE mapping_memory;
REINDEX TABLE mapping_memory;
```

---

## 5. Incident Response Playbooks

### Playbook 1: Database Connection Failure (HTTP 503 from `/api/health`)
**Symptoms**: `/api/health` returns status `degraded` and HTTP 503; users receive 500 on intake submission.  
**Diagnostic Steps**:
1. Check database container status: `docker compose ps postgres`.
2. Check database logs: `docker compose logs --tail 50 postgres`.
3. Verify network connectivity from app to db:
   ```bash
   docker exec -it vistar-intake-app nc -zv postgres 5432
   ```
**Remediation**:
1. If PostgreSQL stopped unexpectedly, restart it: `docker compose restart postgres`.
2. If connection pool is exhausted, restart the app container to clear stale connections: `docker compose restart app`.
3. Check `DATABASE_URL` credentials and `DATABASE_SSL` configuration in `.env.production`.

---

### Playbook 2: Out of Memory (OOM) Crash During Batch Media Healing
**Symptoms**: Container terminates abruptly with exit code `137` (SIGKILL / OOMKilled); high memory spike during image upload.  
**Root Cause**: Client uploaded multiple high-resolution (4K+) uncompressed images concurrently, exceeding container RAM limit.  
**Remediation**:
1. Check host kernel dmesg for OOM kills:
   ```bash
   dmesg -T | grep -i oom
   ```
2. In `docker-compose.yml`, verify memory reservation and increase memory limit:
   ```yaml
   deploy:
     resources:
       limits:
         memory: 2048M
   ```
3. Verify that `src/lib/media/healer.ts` maintains a safe concurrency chunk size of 4:
   ```typescript
   const CHUNK_SIZE = 4;
   ```

---

### Playbook 3: Malformed / Dangerous Spreadsheet Upload Rejection
**Symptoms**: Client receives HTTP 400 with "Blocked dangerous macro file format" or "File signature does not match".  
**Root Cause**: Client submitted a macro-enabled file (`.xlsm`, `.xltm`, `.xlsb`) or disguised binary.  
**Verification**:
1. Confirm file was rejected by `src/lib/security/upload-guard.ts`.
2. Inspect server log: `[SECURITY] Blocked macro-enabled spreadsheet upload: <filename>`.
3. If legitimate client file, ask client to export as standard `.xlsx` (clean XML spreadsheet without VBA macros) or `.csv`.

---

### Playbook 4: Mapping Memory Cache Invalidation
**Symptoms**: Returning client spreadsheet is auto-mapped to incorrect columns due to stale cached header fingerprint.  
**Remediation**:
1. **Via UI**: Navigate to Studio Console -> Mapping Memory Console -> Locate header fingerprint -> Click **Invalidate**.
2. **Via API**:
   ```bash
   curl -X DELETE http://localhost:3000/api/mapping-memory/<mapping_id>
   ```
3. **Emergency Flush (Database Direct)**:
   ```sql
   -- Clear all cached column mappings to force re-analysis
   TRUNCATE TABLE mapping_memory;
   ```

---

### Playbook 5: Zombie / Stuck Submissions Cleanup
**Symptoms**: Submissions remain in `draft` status indefinitely due to aborted client connections.  
**Remediation**:
Run a cleanup query to transition zombie submissions to `error`:
```sql
UPDATE submissions
SET status = 'error'
WHERE status = 'draft' AND created_at < NOW() - INTERVAL '2 hours';
```

---

## 6. Disaster Recovery & Emergency Failover

- **RPO (Recovery Point Objective)**: < 1 hour (backed up via automated hourly snapshots).
- **RTO (Recovery Time Objective)**: < 15 minutes.
- **Failover Procedure**:
  1. Spin up stand-by container stack in target availability zone.
  2. Point `DATABASE_URL` to replicated read-replica or restore latest `pg_dump` snapshot.
  3. Update DNS / Cloudflare origin IP to target stand-by server.
  4. Verify `/api/health` returns HTTP 200 before routing live traffic.
