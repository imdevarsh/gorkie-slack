import type {
  SlackFile,
  SlackMessageContext,
  SlackMessageEvent,
} from '~/types';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  return value as Record<string, unknown>;
}

export function eventChannel(event: SlackMessageEvent): string | undefined {
  return typeof event.channel === 'string' ? event.channel : undefined;
}

export function eventThreadTs(event: SlackMessageEvent): string | undefined {
  const value = asRecord(event)?.thread_ts;
  return typeof value === 'string' ? value : undefined;
}

export function eventRootTs(event: SlackMessageEvent): string | undefined {
  return eventThreadTs(event) ?? event.ts;
}

export function eventTs(event: SlackMessageEvent): string | undefined {
  return typeof event.ts === 'string' ? event.ts : undefined;
}

export function eventUserId(event: SlackMessageEvent): string | undefined {
  const value = asRecord(event)?.user;
  return typeof value === 'string' ? value : undefined;
}

export function eventText(event: SlackMessageEvent): string | undefined {
  const value = asRecord(event)?.text;
  return typeof value === 'string' ? value : undefined;
}

export function eventChannelType(event: SlackMessageEvent): string | undefined {
  const value = asRecord(event)?.channel_type;
  return typeof value === 'string' ? value : undefined;
}

export function eventFiles(event: SlackMessageEvent): SlackFile[] | undefined {
  const value = asRecord(event)?.files;
  return Array.isArray(value) ? (value as SlackFile[]) : undefined;
}

export function contextChannel(
  context: SlackMessageContext
): string | undefined {
  return eventChannel(context.event);
}

export function contextThreadTs(
  context: SlackMessageContext
): string | undefined {
  return eventThreadTs(context.event);
}

export function contextRootTs(
  context: SlackMessageContext
): string | undefined {
  return eventRootTs(context.event);
}

export function contextUserId(
  context: SlackMessageContext
): string | undefined {
  return eventUserId(context.event);
}

export function contextText(context: SlackMessageContext): string | undefined {
  return eventText(context.event);
}

export function contextFiles(
  context: SlackMessageContext
): SlackFile[] | undefined {
  return eventFiles(context.event);
}
