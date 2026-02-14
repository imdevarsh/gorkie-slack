import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { installTools, makeFolders, toolsDigest } from './bootstrap';
import {
  clearLiveId,
  clearSnap,
  getBaseSnap,
  getLiveId,
  getSnap,
  setBaseSnap,
  setLiveId,
} from './queries';
import { cleanupSnapshots, deleteSnapshot, registerSnapshot } from './snapshot';

export class SandboxSession {
  private readonly ctxId: string;
  private readonly context?: SlackMessageContext;

  private constructor(ctxId: string, context?: SlackMessageContext) {
    this.ctxId = ctxId;
    this.context = context;
  }

  static fromContext(context: SlackMessageContext): SandboxSession {
    return new SandboxSession(getContextId(context), context);
  }

  static fromContextId(ctxId: string): SandboxSession {
    return new SandboxSession(ctxId);
  }

  async reconnect(): Promise<Sandbox | null> {
    const sandboxId = await getLiveId(this.ctxId);
    if (!sandboxId) {
      return null;
    }

    const existing = await Sandbox.get({ sandboxId, ...config.auth }).catch(
      () => null
    );
    if (existing?.status === 'running') {
      return existing;
    }

    await clearLiveId(this.ctxId);
    return null;
  }

  async open(): Promise<Sandbox> {
    const live = await this.reconnect();
    if (live) {
      return live;
    }

    const instance = await this.provision();
    await setLiveId(this.ctxId, instance.sandboxId);
    return instance;
  }

  async execute<T>(run: (sandbox: Sandbox) => Promise<T>): Promise<T> {
    const sandbox = await this.open();
    return await run(sandbox);
  }

  async close(): Promise<void> {
    const sandboxId = await getLiveId(this.ctxId);
    if (!sandboxId) {
      return;
    }

    await clearLiveId(this.ctxId);

    const previousSnapshotId = (await getSnap(this.ctxId))?.snapshotId;
    const instance = await Sandbox.get({ sandboxId, ...config.auth }).catch(
      () => null
    );

    if (!instance || instance.status !== 'running') {
      return;
    }

    cleanupSnapshots().catch((error) => {
      logger.warn(
        { error, ctxId: this.ctxId },
        '[sandbox] Snapshot cleanup failed'
      );
    });

    const snap = await instance.snapshot().catch(() => null);
    if (!snap) {
      await forceStop(sandboxId);
      return;
    }

    if (previousSnapshotId && previousSnapshotId !== snap.snapshotId) {
      await deleteSnapshot(previousSnapshotId, this.ctxId);
    }

    await registerSnapshot(this.ctxId, snap.snapshotId);
  }

  private async provision(): Promise<Sandbox> {
    const restored = await this.restoreSnap();
    if (restored) {
      return restored;
    }

    await this.setLoad('is setting up the sandbox');

    const baseSnapshotId = await this.ensureBaseSnap();
    const instance = await Sandbox.create({
      ...(baseSnapshotId
        ? { source: { type: 'snapshot' as const, snapshotId: baseSnapshotId } }
        : { runtime: config.runtime }),
      timeout: config.timeoutMs,
      ...config.auth,
    });

    if (!baseSnapshotId) {
      await makeFolders(instance);
      await installTools(instance);
    }

    logger.info(
      {
        ctxId: this.ctxId,
        sandboxId: instance.sandboxId,
        source: baseSnapshotId ? 'base-snapshot' : 'runtime',
      },
      '[sandbox] Created new sandbox'
    );

    return instance;
  }

  private async restoreSnap(): Promise<Sandbox | null> {
    const snapshot = await getSnap(this.ctxId);
    if (!snapshot) {
      return null;
    }

    const { snapshotId, createdAt } = snapshot;

    if (Date.now() - createdAt > config.snapshot.ttl * 1000) {
      await deleteSnapshot(snapshotId, this.ctxId);
      await clearSnap(this.ctxId);
      return null;
    }

    await this.setLoad('is restoring the sandbox');

    const instance = await Sandbox.create({
      source: { type: 'snapshot', snapshotId },
      timeout: config.timeoutMs,
      ...config.auth,
    }).catch((error: unknown) => {
      logger.warn(
        { snapshotId, error, ctxId: this.ctxId },
        '[sandbox] Failed to restore sandbox from snapshot'
      );
      return null;
    });

    if (!instance) {
      await clearSnap(this.ctxId);
      return null;
    }

    logger.info(
      { snapshotId, sandboxId: instance.sandboxId, ctxId: this.ctxId },
      '[sandbox] Restored sandbox from snapshot'
    );

    return instance;
  }

  private async ensureBaseSnap(): Promise<string | null> {
    const digest = await toolsDigest().catch((error: unknown) => {
      logger.warn(
        { error },
        '[sandbox] Failed to hash tools for base snapshot'
      );
      return null;
    });
    if (!digest) {
      return null;
    }

    const baseSnapshot = await getBaseSnap();
    if (
      baseSnapshot &&
      baseSnapshot.runtime === config.runtime &&
      baseSnapshot.toolsDigest === digest
    ) {
      return baseSnapshot.snapshotId;
    }

    const previousId = baseSnapshot?.snapshotId;
    const instance = await Sandbox.create({
      runtime: config.runtime,
      timeout: config.timeoutMs,
      ...config.auth,
    }).catch((error: unknown) => {
      logger.warn(
        { error },
        '[sandbox] Failed to create base snapshot sandbox'
      );
      return null;
    });

    if (!instance) {
      return null;
    }

    try {
      await makeFolders(instance);
      await installTools(instance);

      const snapshot = await instance.snapshot();
      const createdAt = Date.now();
      await setBaseSnap({
        snapshotId: snapshot.snapshotId,
        createdAt,
        runtime: config.runtime,
        toolsDigest: digest,
      });

      if (previousId && previousId !== snapshot.snapshotId) {
        await deleteSnapshot(previousId, 'base');
      }

      logger.info(
        { snapshotId: snapshot.snapshotId, runtime: config.runtime },
        '[sandbox] Created base snapshot'
      );

      return snapshot.snapshotId;
    } catch (error) {
      logger.warn({ error }, '[sandbox] Failed to create base snapshot');
      return null;
    } finally {
      if (instance.status === 'running') {
        await instance.stop().catch(() => null);
      }
    }
  }

  private async setLoad(status: string): Promise<void> {
    if (!this.context) {
      return;
    }

    await setStatus(this.context, {
      status,
      loading: true,
    });
  }
}

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const session = SandboxSession.fromContext(context);
  return await session.open();
}

export async function stopSandbox(ctxId: string): Promise<void> {
  const session = SandboxSession.fromContextId(ctxId);
  await session.close();
}

export async function reconnectSandbox(ctxId: string): Promise<Sandbox | null> {
  const session = SandboxSession.fromContextId(ctxId);
  return await session.reconnect();
}

async function forceStop(sandboxId: string): Promise<void> {
  const instance = await Sandbox.get({ sandboxId, ...config.auth }).catch(
    () => null
  );
  if (instance?.status === 'running') {
    await instance.stop().catch(() => null);
  }
}
