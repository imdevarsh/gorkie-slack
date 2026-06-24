import {
  createSlackMrkdwn,
  createSlackPlainText,
  escapeSlackText,
} from '@chat-adapter/slack/format';
import { personas } from '@repo/ai';
import { PROMPT_INPUT } from './schema';
import type {
  SlackBlock,
  SlackHomeView,
  SlackModalView,
  SlackTextInputElement,
} from './types';

const maxHomePromptLength = 600;
const maxPromptLength = 3000;

export function buildHomeView({
  prompt,
}: {
  prompt: string | null;
}): SlackHomeView {
  const displayedPrompt = prompt
    ? escapeSlackText(
        prompt.length > maxHomePromptLength
          ? `${prompt.slice(0, maxHomePromptLength)}...`
          : prompt
      )
    : '_No custom instructions set._';

  const blocks: SlackBlock[] = [
    { text: createSlackPlainText('Gorkie'), type: 'header' },
    {
      elements: [
        createSlackMrkdwn(
          'Customize how Gorkie behaves across your Slack conversations.'
        ),
      ],
      type: 'context',
    },
    { type: 'divider' },
    {
      accessory: {
        action_id: 'home_edit_prompt',
        text: createSlackPlainText(prompt ? 'Edit' : 'Add'),
        type: 'button',
      },
      text: createSlackMrkdwn(`*Custom Instructions*\n${displayedPrompt}`),
      type: 'section',
    },
  ];

  if (prompt) {
    blocks.push({
      elements: [
        {
          action_id: 'home_clear_prompt',
          confirm: {
            confirm: createSlackPlainText('Clear'),
            deny: createSlackPlainText('Keep'),
            text: createSlackMrkdwn(
              'Your custom instructions will be removed.'
            ),
            title: createSlackPlainText('Clear instructions?'),
          },
          style: 'danger',
          text: createSlackPlainText('Clear instructions'),
          type: 'button',
        },
      ],
      type: 'actions',
    });
  }

  return { blocks, type: 'home' };
}

export function buildPromptModal({
  prompt,
  showPresets = false,
}: {
  prompt: string | null;
  showPresets?: boolean;
}): SlackModalView {
  const input: SlackTextInputElement = {
    action_id: PROMPT_INPUT,
    max_length: maxPromptLength,
    multiline: true,
    placeholder: createSlackPlainText(
      'e.g. Keep responses concise. Prefer TypeScript. Call me Alex.'
    ),
    type: 'plain_text_input',
  };

  if (prompt) {
    input.initial_value = prompt;
  }

  const presetBlocks: SlackBlock[] = showPresets
    ? personas.map((persona) => ({
        accessory: {
          action_id: 'modal_load_preset',
          text: createSlackPlainText('Load'),
          type: 'button',
          value: persona.id,
        },
        text: createSlackMrkdwn(
          `*${escapeSlackText(persona.name)}:* ${escapeSlackText(persona.description)}`
        ),
        type: 'section',
      }))
    : [];

  return {
    blocks: [
      {
        accessory: {
          action_id: 'modal_toggle_presets',
          text: createSlackPlainText(showPresets ? 'Close' : 'Open'),
          type: 'button',
        },
        text: createSlackMrkdwn(
          showPresets ? '*Presets*' : '*Presets*: load a persona'
        ),
        type: 'section',
      },
      ...presetBlocks,
      { type: 'divider' },
      {
        block_id: 'customization_prompt',
        element: input,
        hint: createSlackPlainText(
          'Gorkie follows these instructions across every conversation.'
        ),
        label: createSlackPlainText('Your instructions'),
        type: 'input',
      },
    ],
    callback_id: 'home_save_prompt',
    close: createSlackPlainText('Cancel'),
    private_metadata: JSON.stringify({ showPresets }),
    submit: createSlackPlainText('Save'),
    title: createSlackPlainText('Custom Instructions'),
    type: 'modal',
  };
}

export function buildPresetModal({
  description,
  name,
  prompt,
}: {
  description: string;
  name: string;
  prompt: string;
}): SlackModalView {
  return {
    blocks: [
      {
        elements: [createSlackMrkdwn(escapeSlackText(description))],
        type: 'context',
      },
      {
        block_id: 'customization_prompt',
        element: {
          action_id: PROMPT_INPUT,
          initial_value: prompt,
          max_length: maxPromptLength,
          multiline: true,
          type: 'plain_text_input',
        },
        hint: createSlackPlainText('You can edit this before saving.'),
        label: createSlackPlainText('Preset instructions'),
        type: 'input',
      },
    ],
    callback_id: 'home_save_preset_prompt',
    close: createSlackPlainText('Back'),
    submit: createSlackPlainText('Use this preset'),
    title: createSlackPlainText(name),
    type: 'modal',
  };
}
