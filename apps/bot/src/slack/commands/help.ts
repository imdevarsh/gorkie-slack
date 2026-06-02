import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from '@slack/bolt';
import { subcommands } from './subcommands';

export const name = 'help';

export async function execute(
  ctx: SlackCommandMiddlewareArgs & AllMiddlewareArgs
) {
  const { ack, command, respond } = ctx;
  await ack();

  const commandName = command.text?.trim() || null;

  if (commandName) {
    const entry = subcommands.find((c) => c.name === commandName);
    if (entry?.help) {
      const { help } = entry;
      const subcommandText = help.subcommands
        .map(
          (s: { usage: string; description: string }) =>
            `• \`${command.command} ${s.usage}\`: ${s.description}`
        )
        .join('\n');

      await respond({
        text: `*Command: ${help.name}*\n${help.description}\n\n*Usage:*\n${subcommandText}`,
        response_type: 'ephemeral',
      });
    } else {
      await respond({
        text: `Unknown command: \`${commandName}\`\nRun \`${command.command} help\` to see all commands.`,
        response_type: 'ephemeral',
      });
    }
    return;
  }

  const allCommandsText = subcommands
    .filter((c) => c.help)
    .map((c) => `*${c.help.name}:* ${c.help.description}`)
    .join('\n');

  await respond({
    text: `*Gorkie*\navailable commands\n\n${allCommandsText}\n\nRun \`${command.command} help <command>\` for detailed usage.`,
    response_type: 'ephemeral',
  });
}
