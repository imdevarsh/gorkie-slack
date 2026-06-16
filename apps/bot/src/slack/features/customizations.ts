import { callSlackApi, openSlackView } from '@chat-adapter/slack/api';
import {
  createSlackMrkdwn,
  createSlackPlainText,
  escapeSlackText,
} from '@chat-adapter/slack/format';
import { personas } from '@repo/ai';
import {
  clearUserCustomization,
  getUserCustomization,
  setUserCustomization,
} from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import { z } from 'zod';
import { bot } from '@/chat';
import { env } from '@/env';
import logger from '@/lib/logger';

const PROMPT_INPUT = 'prompt';
const MAX_PROMPT_LENGTH = 3000;
const MAX_HOME_PROMPT_LENGTH = 900;

const modalStateSchema = z
  .object({
    showPresets: z.boolean().default(false),
  })
  .catch({ showPresets: false });

const openedViewSchema = z.object({
  hash: z.string().optional(),
  id: z.string(),
});

const slackActionViewSchema = z.object({
  view: z.object({
    hash: z.string().optional(),
    id: z.string(),
    private_metadata: z.string().optional(),
    state: z
      .object({ values: z.unknown().optional() })
      .passthrough()
      .optional(),
  }),
});

const slackInputValuesSchema = z.record(
  z.string(),
  z.record(
    z.string(),
    z.object({ value: z.string().nullable().optional() }).passthrough()
  )
);

type SlackText = ReturnType<
  typeof createSlackMrkdwn | typeof createSlackPlainText
>;

interface SlackButtonElement {
  action_id?: string;
  confirm?: SlackConfirm;
  style?: 'danger' | 'primary';
  text: ReturnType<typeof createSlackPlainText>;
  type: 'button';
  value?: string;
}

interface SlackTextInputElement {
  action_id: string;
  initial_value?: string;
  max_length?: number;
  multiline?: boolean;
  placeholder?: ReturnType<typeof createSlackPlainText>;
  type: 'plain_text_input';
}

interface SlackConfirm {
  confirm: ReturnType<typeof createSlackPlainText>;
  deny: ReturnType<typeof createSlackPlainText>;
  text: ReturnType<typeof createSlackMrkdwn>;
  title: ReturnType<typeof createSlackPlainText>;
}

type SlackBlock =
  | {
      type: 'actions';
      elements: SlackButtonElement[];
    }
  | {
      accessory?: SlackButtonElement;
      text: ReturnType<typeof createSlackMrkdwn>;
      type: 'section';
    }
  | {
      elements: SlackText[];
      type: 'context';
    }
  | {
      type: 'divider';
    }
  | {
      text: ReturnType<typeof createSlackPlainText>;
      type: 'header';
    }
  | {
      block_id: string;
      element: SlackTextInputElement;
      hint?: ReturnType<typeof createSlackPlainText>;
      label: ReturnType<typeof createSlackPlainText>;
      type: 'input';
    };

interface SlackHomeView {
  blocks: SlackBlock[];
  type: 'home';
}

interface SlackModalView {
  blocks: SlackBlock[];
  callback_id: string;
  close: ReturnType<typeof createSlackPlainText>;
  private_metadata?: string;
  submit?: ReturnType<typeof createSlackPlainText>;
  title: ReturnType<typeof createSlackPlainText>;
  type: 'modal';
}

function parseModalState({
  metadata,
}: {
  metadata?: string;
}): z.output<typeof modalStateSchema> {
  if (!metadata) {
    return { showPresets: false };
  }

  try {
    return modalStateSchema.parse(JSON.parse(metadata));
  } catch {
    return { showPresets: false };
  }
}

function promptFromViewValues({ values }: { values: unknown }): string | null {
  const parsed = slackInputValuesSchema.safeParse(values);
  if (!parsed.success) {
    return null;
  }

  const input = parsed.data.customization_prompt?.[PROMPT_INPUT];
  return typeof input?.value === 'string' ? input.value.trim() : null;
}

function buildHomeView({ prompt }: { prompt: string | null }): SlackHomeView {
  const displayedPrompt = prompt
    ? escapeSlackText(
        prompt.length > MAX_HOME_PROMPT_LENGTH
          ? `${prompt.slice(0, MAX_HOME_PROMPT_LENGTH)}...`
          : prompt
      )
    : '_No custom instructions set._';

  const blocks: SlackBlock[] = [
    {
      text: createSlackPlainText('Gorkie'),
      type: 'header',
    },
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

function buildLoadingModal(): SlackModalView {
  return {
    blocks: [
      {
        text: createSlackMrkdwn('Loading custom instructions...'),
        type: 'section',
      },
    ],
    callback_id: 'home_save_prompt',
    close: createSlackPlainText('Cancel'),
    title: createSlackPlainText('Custom Instructions'),
    type: 'modal',
  };
}

function buildPromptModal({
  prompt,
  showPresets = false,
}: {
  prompt: string | null;
  showPresets?: boolean;
}): SlackModalView {
  const input: SlackTextInputElement = {
    action_id: PROMPT_INPUT,
    max_length: MAX_PROMPT_LENGTH,
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

function buildPresetModal({
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
          max_length: MAX_PROMPT_LENGTH,
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

async function publishHome({ userId }: { userId: string }): Promise<void> {
  const customization = await getUserCustomization(userId);

  await callSlackApi(
    'views.publish',
    {
      user_id: userId,
      view: buildHomeView({ prompt: customization?.prompt ?? null }),
    },
    { token: env.SLACK_BOT_TOKEN }
  );
}

bot.onAppHomeOpened(async (event) => {
  await publishHome({ userId: event.userId }).catch((error: unknown) => {
    logger.warn(
      { ...toLogError(error), userId: event.userId },
      'Failed to publish App Home'
    );
  });
});

bot.onAction('home_edit_prompt', async (event) => {
  if (!event.triggerId) {
    logger.warn(
      { userId: event.user.userId },
      'App Home action missing trigger ID'
    );
    return;
  }

  const opened = await openSlackView({
    token: env.SLACK_BOT_TOKEN,
    triggerId: event.triggerId,
    view: buildLoadingModal(),
  }).catch((error: unknown) => {
    logger.warn(
      { ...toLogError(error), userId: event.user.userId },
      'Failed to open custom instructions modal'
    );
    return null;
  });

  const openedView = openedViewSchema.safeParse(opened?.view);

  if (!(opened && openedView.success)) {
    logger.warn(
      { userId: event.user.userId },
      'Custom instructions modal opened without a view ID'
    );
    return;
  }

  const customization = await getUserCustomization(event.user.userId).catch(
    (error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId: event.user.userId },
        'Failed to load custom instructions for modal'
      );
      return null;
    }
  );

  await callSlackApi(
    'views.update',
    {
      hash: openedView.data.hash,
      view: buildPromptModal({ prompt: customization?.prompt ?? null }),
      view_id: openedView.data.id,
    },
    {
      token: env.SLACK_BOT_TOKEN,
    }
  ).catch((error: unknown) => {
    logger.warn(
      { ...toLogError(error), userId: event.user.userId },
      'Failed to update custom instructions modal'
    );
  });
});

bot.onAction('modal_toggle_presets', async (event) => {
  const raw = slackActionViewSchema.safeParse(event.raw);

  if (!(raw.success && raw.data.view)) {
    logger.warn(
      { userId: event.user.userId },
      'Preset toggle action missing modal view'
    );
    return;
  }

  const state = parseModalState({ metadata: raw.data.view.private_metadata });
  const prompt = promptFromViewValues({
    values: raw.data.view.state?.values,
  });

  await callSlackApi(
    'views.update',
    {
      hash: raw.data.view.hash,
      view: buildPromptModal({
        prompt,
        showPresets: !state.showPresets,
      }),
      view_id: raw.data.view.id,
    },
    { token: env.SLACK_BOT_TOKEN }
  ).catch((error: unknown) => {
    logger.warn(
      { ...toLogError(error), userId: event.user.userId },
      'Failed to toggle custom instruction presets'
    );
  });
});

bot.onAction('modal_load_preset', async (event) => {
  const preset = personas.find((persona) => persona.id === event.value);

  if (!(preset && event.triggerId)) {
    logger.warn(
      { presetId: event.value, userId: event.user.userId },
      'Preset load action missing preset or trigger ID'
    );
    return;
  }

  await callSlackApi(
    'views.push',
    {
      trigger_id: event.triggerId,
      view: buildPresetModal(preset),
    },
    { token: env.SLACK_BOT_TOKEN }
  ).catch((error: unknown) => {
    logger.warn(
      {
        ...toLogError(error),
        presetId: preset.id,
        userId: event.user.userId,
      },
      'Failed to open custom instruction preset'
    );
  });
});

bot.onAction('home_clear_prompt', async (event) => {
  await clearUserCustomization(event.user.userId)
    .then(() => publishHome({ userId: event.user.userId }))
    .catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId: event.user.userId },
        'Failed to clear custom instructions'
      );
    });
});

bot.onModalSubmit(
  ['home_save_prompt', 'home_save_preset_prompt'],
  async (event) => {
    const prompt = event.values[PROMPT_INPUT]?.trim();

    if (prompt === undefined) {
      return {
        action: 'errors',
        errors: { customization_prompt: 'Could not read custom instructions.' },
      };
    }

    try {
      if (prompt) {
        await setUserCustomization(event.user.userId, { prompt });
      } else {
        await clearUserCustomization(event.user.userId);
      }
    } catch (error) {
      logger.warn(
        { ...toLogError(error), userId: event.user.userId },
        'Failed to save custom instructions'
      );
      return {
        action: 'errors',
        errors: {
          customization_prompt:
            'Could not save custom instructions. Try again.',
        },
      };
    }

    await publishHome({ userId: event.user.userId }).catch((error: unknown) => {
      logger.warn(
        { ...toLogError(error), userId: event.user.userId },
        'Failed to refresh App Home after custom instructions save'
      );
    });

    if (event.callbackId === 'home_save_preset_prompt') {
      return { action: 'clear' };
    }
  }
);
