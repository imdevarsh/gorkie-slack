import { Blocks, Elements } from 'slack-block-builder';

export function dataTrainingBlocks(allowDataTraining: boolean) {
  const description = allowDataTraining
    ? 'When inference is unavailable, Gorkie uses fallback models. Data may be used to improve the model. Disable this in settings.'
    : 'Fallback is disabled. If inference is unavailable, Gorkie may not be able to respond.';

  return [
    Blocks.Section({ text: `*Data Training*\n${description}` }).accessory(
      Elements.Button({
        text: allowDataTraining ? 'Disable' : 'Enable',
        actionId: 'home_toggle_data_training',
      }).danger(allowDataTraining)
    ),
  ];
}
