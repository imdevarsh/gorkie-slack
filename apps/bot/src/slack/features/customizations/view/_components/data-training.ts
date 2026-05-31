import { Blocks, Elements } from 'slack-block-builder';

export function dataTrainingBlocks(allowTraining: boolean) {
  const description = allowTraining
    ? 'When inference is unavailable, Gorkie falls back to other models. Data might be used to improve the model.'
    : 'Gorkie only uses inference. If it is unavailable, Gorkie may not be able to respond.';

  return [
    Blocks.Section({ text: `*Data Training*\n${description}` }).accessory(
      Elements.Button({
        text: allowTraining ? 'Disable' : 'Enable',
        actionId: 'home_toggle_data_training',
      }).danger(allowTraining)
    ),
  ];
}
