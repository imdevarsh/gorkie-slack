import { parsePrivateMetadata, serverMetaSchema } from '../../schema';
import type { CloseArgs } from '../../types';

export function parseConnectClosedPayload({
  view,
}: {
  view: CloseArgs['view'];
}): { serverId: string | null } {
  const meta = serverMetaSchema.safeParse(
    parsePrivateMetadata({ metadata: view.private_metadata })
  );
  return { serverId: meta.success ? (meta.data.serverId ?? null) : null };
}
