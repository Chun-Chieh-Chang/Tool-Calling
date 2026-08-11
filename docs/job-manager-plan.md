# Job Manager — Async Tool Execution System

**Created**: 2026-08-10
**Purpose**: Transform sync `run_tool` into async job-based execution

---

## Design

### Job States
```
pending → running → completed | failed | cancelled
```

### API Endpoints (MCP Tools)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/jobs` | Create new job (returns `job_id`) |
| GET | `/jobs/:id` | Get job status + output |
| DELETE | `/jobs/:id` | Cancel running job |
| GET | `/jobs` | List all jobs (with pagination) |

### Timeout Config
- Default: 120 seconds
- Per-job override via `timeout_seconds` param
- Max: 600 seconds (10 minutes)

---

## Implementation Plan

### Step 1: `core/job-manager.js`
- In-memory Map for job storage
- TTL auto-cleanup (jobs > 1 hour archived)
- Promise-based with abort controller

### Step 2: Update `mcp-server.js`
- Replace sync `run_tool` with async job creation
- Add new MCP tools:
  - `create_job` — Submit tool execution
  - `get_job_status` — Poll job status
  - `cancel_job` — Cancel pending/running job
  - `list_jobs` — View recent jobs

### Step 3: Tests
- `tests/job-manager.test.js` — Core logic
- Update `mcp-server` integration tests
