import { type Persona, personas } from '@repo/ai/prompts/chat/presets';
import { Blocks, Elements, Modal } from 'slack-block-builder';
import type { SlackModalDto } from 'slack-block-builder/dist/internal';
import type { ModalState } from './schema';

export function buildPromptLoadingModal(): SlackModalDto {
  return Modal({
    title: 'Custom Instructions',
    close: 'Cancel',
  })
    .blocks(Blocks.Section({ text: 'Loading custom instructions...' }))
    .buildToObject();
}

export function buildPromptModal({
  currentPrompt,
  state = { showPresets: false },
}: {
  currentPrompt: string | null;
  state?: ModalState;
}): SlackModalDto {
  const { showPresets } = state;

  const presetBlocks = showPresets
    ? personas.map((p) =>
        Blocks.Section({ text: `*${p.name}:* ${p.description}` }).accessory(
          Elements.Button({
            text: 'Load',
            actionId: 'modal_load_preset',
            value: p.id,
          })
        )
      )
    : [];

  return Modal({
    title: 'Custom Instructions',
    submit: 'Save',
    close: 'Cancel',
    callbackId: 'home_save_prompt',
    privateMetaData: JSON.stringify(state),
  })
    .blocks(
      Blocks.Section({
        text: showPresets ? '*Presets*' : '*Presets*: load a persona',
      }).accessory(
        Elements.Button({
          text: showPresets ? 'Close' : 'Open',
          actionId: 'modal_toggle_presets',
        })
      ),
      ...presetBlocks,
      Blocks.Divider(),
      Blocks.Input({
        blockId: 'prompt_block',
        label: 'Your instructions',
        hint: 'Gorkie follows these across every conversation.',
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

export function buildPresetModal(preset: Persona): SlackModalDto {
  return Modal({
    title: preset.name,
    submit: 'Use this preset',
    close: 'Back',
    callbackId: 'home_save_preset_prompt',
  })
    .blocks(
      Blocks.Context().elements(preset.description),
      Blocks.Input({
        blockId: 'prompt_block',
        label: 'Preset instructions',
        hint: 'You can edit these before saving.',
      }).element(
        Elements.TextInput({
          actionId: 'prompt_input',
          multiline: true,
          maxLength: 3000,
          initialValue: preset.prompt,
        })
      )
    )
    .buildToObject();
}
