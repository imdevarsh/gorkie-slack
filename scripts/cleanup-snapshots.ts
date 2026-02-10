import { Snapshot } from '@vercel/sandbox';
import { env } from '../server/env';

async function run(): Promise<void> {
  const projectId = env.VERCEL_PROJECT_ID;

  let totalDeleted = 0;
  let iteration = 0;

  while (true) {
    iteration++;
    const response = await Snapshot.list({
      limit: 100
    });

    const snapshots = response.json.snapshots;
    if (!snapshots.length) {
      break;
    }

    for (const snap of snapshots) {
      try {
        const snapshot = await Snapshot.get({
          snapshotId: snap.id,
          projectId
        });
        await snapshot.delete();
        totalDeleted++;

        console.log(`Deleted snapshot ${snap.id}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.log(`Failed to delete snapshot ${snap.id}: ${message}`);
      }
    }

    console.log(`Iteration ${iteration} complete. Deleted so far: ${totalDeleted}`);
  }

  console.log(`Done. Deleted ${totalDeleted} snapshots.`);
}

void run();
