import { Snapshot } from '@vercel/sandbox';
import { env } from '../server/env';

async function run(): Promise<void> {
  const projectId = env.VERCEL_PROJECT_ID;
  const teamId = env.VERCEL_TEAM_ID;
  const token = env.VERCEL_OIDC_TOKEN;

  let totalDeleted = 0;
  let iteration = 0;
  let cursor: number | null | undefined;

  while (true) {
    iteration++;
    const response = await Snapshot.list({
      limit: 100,
      projectId,
      teamId,
      token,
      ...(cursor ? { until: cursor } : {}),
    });

    const snapshots = response.json.snapshots;
    if (!snapshots.length) {
      break;
    }

    console.log(response.json)

    for (const snap of snapshots) {
      if (snap.status === 'deleted') {
        continue;
      }
      try {
        const snapshot = await Snapshot.get({
          snapshotId: snap.id,
          projectId,
          teamId,
          token
        });
        await snapshot.delete();
        totalDeleted++;

        console.log(`Deleted snapshot ${snap.id}`);
      } catch (error) {
        const err = error as {
          message?: string;
          text?: string;
          json?: { error?: { message?: string; code?: string } };
          response?: { status?: number };
        };
        const message = err.message ?? String(error);
        const status = err.response?.status;
        const apiMessage = err.json?.error?.message ?? err.text;
        console.log(
          `Failed to delete snapshot ${snap.id}: ${message}${
            status ? ` (status ${status})` : ''
          }${apiMessage ? ` | ${apiMessage}` : ''}`
        );
      }
    }

    console.log(
      `Iteration ${iteration} complete. Deleted so far: ${totalDeleted}`
    );

    cursor = response.json.pagination.next;
    if (!cursor) {
      break;
    }
  }

  console.log(`Done. Deleted ${totalDeleted} snapshots.`);
}

void run();
