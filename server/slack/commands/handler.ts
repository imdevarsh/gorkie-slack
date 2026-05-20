import { splitArgs } from '~/utils/text';
import { execute as helpExecute, name as helpName } from './help';
import { subcommands } from './subcommands';

type CommandContext = Parameters<(typeof subcommands)[0]['execute']>[0];

const allCommands = [...subcommands, { name: helpName, execute: helpExecute }];

export async function handleCommand(context: CommandContext): Promise<void> {
  const { command, respond } = context;
  const parts = splitArgs(command.text);
  const subcommand = parts[0]?.toLowerCase() ?? null;
  const args = parts.slice(1).join(' ');

  if (!subcommand) {
    await helpExecute(context);
    return;
  }

  const handler = allCommands.find((s) => s.name === subcommand);
  if (!handler) {
    await context.ack();
    await respond({
      text: `Unknown subcommand: \`${subcommand}\`\nRun \`${command.command} help\` to see all commands.`,
      response_type: 'ephemeral',
    });
    return;
  }

  await handler.execute({ ...context, command: { ...command, text: args } });
}
