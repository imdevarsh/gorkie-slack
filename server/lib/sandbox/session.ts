import { Sandbox } from '@vercel/sandbox';
import { sandbox as config } from '~/config';
import { setStatus } from '~/lib/ai/utils/status';
import logger from '~/lib/logger';
import type { SlackMessageContext } from '~/types';
import { getContextId } from '~/utils/context';
import { installTools, makeFolders } from './bootstrap';
import * as redis from './queries';
import { cleanupSnapshots, deleteSnapshot } from './snapshot';

export class SandboxSession {
  private readonly ctxId: string;
  private readonly context: SlackMessageContext;

  private constructor(ctxId: string, context: SlackMessageContext) {
    this.ctxId = ctxId;
    this.context = context;
  }

  static fromContext(context: SlackMessageContext): SandboxSession {
    return new SandboxSession(getContextId(context), context);
  }

  async reconnect(): Promise<Sandbox | null> {
    const { sandboxId } = await redis.getState(this.ctxId);
    if (!sandboxId) {
      return null;
    }

    const existing = await Sandbox.get({ sandboxId, ...config.auth }).catch(
      () => null
    );
    if (existing?.status === 'running') {
      return existing;
    }

    await redis.clearSandbox(this.ctxId);
    return null;
  }

  async open(): Promise<Sandbox> {
    const live = await this.reconnect();
    if (live) {
      return live;
    }

    const instance = await this.provision();
    await redis.setSandboxId(this.ctxId, instance.sandboxId);
    return instance;
  }

  async close(): Promise<void> {
    const state = await redis.getState(this.ctxId);
    const sandboxId = state.sandboxId;
    if (!sandboxId) {
      return;
    }

    await redis.clearSandbox(this.ctxId);

    const previousSnapshotId = state.snapshot?.snapshotId;
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

    const nextSnapshot = await instance.snapshot().catch(() => null);
    if (!nextSnapshot) {
      await forceStop(sandboxId);
      return;
    }

    if (previousSnapshotId && previousSnapshotId !== nextSnapshot.snapshotId) {
      await deleteSnapshot(previousSnapshotId, this.ctxId);
    }

    await redis.putSnapshot(this.ctxId, nextSnapshot.snapshotId, Date.now());
  }

  private async provision(): Promise<Sandbox> {
    const restored = await this.restoreSnap();
    if (restored) {
      return restored;
    }

    await setStatus(this.context, {
      status: 'is setting up the sandbox',
      loading: true,
    });

    const base = await this.getBase();
    const instance = await Sandbox.create({
      ...(base
        ? { source: { type: 'snapshot' as const, snapshotId: base } }
        : { runtime: config.runtime }),
      timeout: config.timeoutMs,
      ...config.auth,
    });

    if (!base) {
      await makeFolders(instance);
      await installTools(instance);
    }

    logger.info(
      {
        ctxId: this.ctxId,
        sandboxId: instance.sandboxId,
        source: base ? 'base-snapshot' : 'runtime',
      },
      '[sandbox] Created new sandbox'
    );

    return instance;
  }

  private async restoreSnap(): Promise<Sandbox | null> {
    const { snapshot } = await redis.getState(this.ctxId);
    if (!snapshot) {
      return null;
    }

    const { snapshotId, createdAt } = snapshot;

    if (Date.now() - createdAt > config.snapshot.ttl * 1000) {
      await deleteSnapshot(snapshotId, this.ctxId);
      await redis.clearSnapshot(this.ctxId);
      return null;
    }

    await setStatus(this.context, {
      status: 'is restoring the sandbox',
      loading: true,
    });

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
      await redis.clearSnapshot(this.ctxId);
      return null;
    }

    logger.info(
      { snapshotId, sandboxId: instance.sandboxId, ctxId: this.ctxId },
      '[sandbox] Restored sandbox from snapshot'
    );

    return instance;
  }

  private async getBase(): Promise<string | null> {
    const base = await redis.getBase();
    if (base && base.runtime === config.runtime) {
      return base.snapshotId;
    }

    const previousId = base?.snapshotId;
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
      await redis.setBase({
        snapshotId: snapshot.snapshotId,
        createdAt,
        runtime: config.runtime,
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
}

export async function getSandbox(
  context: SlackMessageContext
): Promise<Sandbox> {
  const session = SandboxSession.fromContext(context);
  return await session.open();
}

export async function stopSandbox(context: SlackMessageContext): Promise<void> {
  const session = SandboxSession.fromContext(context);
  await session.close();
}

export async function reconnectSandbox(
  context: SlackMessageContext
): Promise<Sandbox | null> {
  const session = SandboxSession.fromContext(context);
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
