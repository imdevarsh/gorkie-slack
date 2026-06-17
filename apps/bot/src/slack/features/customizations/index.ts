import { callSlackApi, openSlackView } from '@chat-adapter/slack/api';
import { personas } from '@repo/ai';
import {
  clearUserCustomization,
  getUserCustomization,
  setUserCustomization,
} from '@repo/db/queries';
import { toLogError } from '@repo/utils/error';
import { env } from '@/env';
import { bot } from '@/lib/chat';
import logger from '@/lib/logger';
import {
  openedViewSchema,
  PROMPT_INPUT,
  parseModalState,
  promptFromViewValues,
  slackActionViewSchema,
} from './schema';
import { publishHome } from './service';
import { buildLoadingModal, buildPresetModal, buildPromptModal } from './views';

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
    { token: env.SLACK_BOT_TOKEN }
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
  const prompt = promptFromViewValues({ values: raw.data.view.state?.values });

  await callSlackApi(
    'views.update',
    {
      hash: raw.data.view.hash,
      view: buildPromptModal({ prompt, showPresets: !state.showPresets }),
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
      { ...toLogError(error), presetId: preset.id, userId: event.user.userId },
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
