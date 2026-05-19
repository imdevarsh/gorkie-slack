import { Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import { personas } from '~/lib/ai/prompts/chat/presets';

export function buildPromptModal(currentPrompt: string | null): SlackModalDto {
  return Modal({
    title: 'Custom Instructions',
    submit: 'Save',
    close: 'Cancel',
    callbackId: 'home_save_prompt',
  })
    .blocks(
      Blocks.Section({
        text: '*Presets*\nClick a preset to load it into the editor, then tweak as needed.',
      }),
      Blocks.Actions().elements(
        ...personas.map((p) =>
          Elements.Button({
            text: p.name,
            actionId: `modal_set_preset_${p.id}`,
            value: p.id,
          })
        )
      ),
      Blocks.Divider(),
      Blocks.Input({
        blockId: 'prompt_block',
        label: 'Your instructions',
        hint: 'Gorkie follows these across every conversation. Use the Clear button on the home tab to remove.',
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
