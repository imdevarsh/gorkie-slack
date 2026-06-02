import { Bits, Blocks, Elements, setIfTruthy } from 'slack-block-builder';
import { appHome } from '@/config';
import { mdText } from '@/slack/blocks';

export function customInstructionsBlocks(
  customization: { prompt?: string } | null
) {
  const userPrompt = customization?.prompt ?? null;
  let promptDisplay = '_No custom instructions set._';
  if (userPrompt) {
    promptDisplay =
      userPrompt.length > appHome.maxPromptDisplay
        ? `${userPrompt.slice(0, appHome.maxPromptDisplay)}...`
        : userPrompt;
  }

  return [
    Blocks.Section({
      text: `*Custom Instructions*\n${mdText(promptDisplay)}`,
    }).accessory(
      Elements.Button({
        text: userPrompt ? 'Edit' : 'Add',
        actionId: 'home_edit_prompt',
      })
    ),
    setIfTruthy(
      userPrompt,
      Blocks.Actions().elements(
        Elements.Button({
          text: 'Clear instructions',
          actionId: 'home_clear_prompt',
        })
          .danger()
          .confirm(
            Bits.ConfirmationDialog({
              title: 'Clear instructions?',
              text: 'Your custom instructions will be removed.',
              confirm: 'Clear',
              deny: 'Keep',
            })
          )
      )
    ),
  ];
}
