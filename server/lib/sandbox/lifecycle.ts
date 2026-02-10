import { Sandbox } from '@vercel/sandbox';
import type { SlackMessageContext } from '~/types';
import { syncAttachments } from './attachments';
import { reconnectSandbox } from './connect';
import { provisionSandbox } from './provision';
import {
  clearSandboxId,
  getSandboxId,
  getSnapshotRaw,
  setSandboxId,
} from './queries';
import {
  cleanupSnapshots,
  deleteSnapshot,
  parseSnapshotRecord,
  registerSnapshot,
} from './snapshot';
import type { SandboxAttachments } from './types';

export async function getSandbox(
  ctxId: string,
  context?: SlackMessageContext,
  attachments?: SandboxAttachments
): Promise<Sandbox> {
  const live = await reconnectSandbox(ctxId);
  if (live) {
    await syncAttachments(live, ctxId, attachments);
    return live;
  }

  const instance = await provisionSandbox(ctxId, context);
  await syncAttachments(instance, ctxId, attachments);
  await setSandboxId(ctxId, instance.sandboxId);
  return instance;
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}

export async function stopSandbox(ctxId: string): Promise<void> {
  const sandboxId = await getSandboxId(ctxId);
  if (!sandboxId) {
    return;
  }

  await clearSandboxId(ctxId);
  const previousSnapshotRaw = await getSnapshotRaw(ctxId);
  const previousSnapshotId =
    parseSnapshotRecord(previousSnapshotRaw ?? '')?.snapshotId ?? null;

  const instance = await Sandbox.get({ sandboxId }).catch(() => null);
  if (!instance || instance.status !== 'running') {
    return;
  }

  await cleanupSnapshots();
  const snap = await instance.snapshot().catch(() => null);
  if (!snap) {
    await forceStop(sandboxId);
    return;
  }

  if (previousSnapshotId && previousSnapshotId !== snap.snapshotId) {
    await deleteSnapshot(previousSnapshotId, ctxId);
  }

  await registerSnapshot(ctxId, snap.snapshotId);
}
