import type { MCPServer, MCPToolModeMap } from '@repo/db/schema';
import { errorMessage } from '@repo/utils/error';
import { syncMCPToolModes } from '@/lib/mcp/remote';
import type { ToolEntry } from '../view/tools';
import { toToolEntries } from '../view/tools';

export async function syncToolsForView({
  server,
  userId,
}: {
  server: MCPServer;
  userId: string;
}): Promise<{
  error?: string;
  toolEntries: ToolEntry[];
  toolModes: MCPToolModeMap;
}> {
  try {
    const synced = await syncMCPToolModes({ server, userId });
    return {
      toolEntries: toToolEntries(synced.definitions.tools),
      toolModes: synced.modes,
    };
  } catch (err) {
    return { error: errorMessage(err), toolEntries: [], toolModes: {} };
  }
}
