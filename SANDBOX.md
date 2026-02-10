# Sandbox Storage Notes

This project uses Vercel Sandbox snapshots to persist state between thread messages.

## What Persists
- A snapshot is taken at the end of each message that used the sandbox.
- Only one snapshot per thread is kept. The previous snapshot is deleted when a new one is created.
- Pruning is currently disabled to measure snapshot growth.
- System packages (installed with `dnf`) are outside `/home/vercel-sandbox`, so they remain part of the snapshot and contribute to snapshot size.

## TTL vs Snapshot Retention
- `sandbox.snapshot.ttl` in `server/config.ts` controls the app-level snapshot lifetime (default: 24 hours).
- On restore, snapshots older than this TTL are deleted and ignored.
- The snapshot ID and timestamp are stored in Redis and expire together.
- If a thread is never restored, its snapshot may remain until Vercel’s automatic expiration (7 days).
- A cleanup pass runs on each snapshot and every 30 minutes in the server process to delete any snapshots older than the TTL.

## Why Storage Can Grow
Storage is measured as GB-month across all snapshots that exist at a given time.
Even though each thread keeps only one snapshot, many active threads still mean many snapshots.

Example:
- 5 threads with 5.5 GB snapshots each
- Total stored at any time: ~27.5 GB
- If those snapshots exist for a full month, usage is ~27.5 GB-month

If a thread goes idle, its last snapshot can still count toward storage until it expires.

## Cost Estimation Formula
Use this to estimate snapshot storage:

```
GB-month ≈ (sum of snapshot sizes in GB) × (days retained / 30)
```

If you have 6–7 threads with 2–5 GB snapshots and those snapshots are retained for 24 hours:

```
Total size ≈ 12–35 GB
GB-month ≈ (12–35) × (1/30) = 0.40–1.17 GB-month
```

Multiply GB-month by the plan’s rate to get cost.

## Where This Is Implemented
- Snapshot creation and pruning: `server/lib/ai/tools/sandbox/bash/sandbox.ts`
- Snapshot cleanup helpers: `server/lib/ai/tools/sandbox/bash/snapshot.ts`
- Snapshot config: `server/config.ts`
