import { Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';

export function buildPromptModal(currentPrompt: string | null): SlackModalDto {
  return Modal({
    title: 'Custom Instructions',
    submit: 'Save',
    close: 'Cancel',
    callbackId: 'home_save_prompt',
  })
    .blocks(
      Blocks.Section({
        text: 'Tell Gorkie how you want it to behave in every conversation - your preferred language, tone, name, or anything else.',
      }),
      Blocks.Input({
        blockId: 'prompt_block',
        label: 'Your instructions',
      }).element(
        Elements.TextInput({
          actionId: 'prompt_input',
          multiline: true,
          maxLength: 3000,
          placeholder:
            'e.g. Always reply in Spanish. Keep responses concise. My name is Alex.',
          initialValue: currentPrompt ?? undefined,
        })
      )
    )
    .buildToObject();
}
