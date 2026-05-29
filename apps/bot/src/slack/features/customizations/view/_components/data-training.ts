import { Blocks, Elements } from 'slack-block-builder';

export function dataTrainingBlocks(allowDataTraining: boolean) {
  const description = allowDataTraining
    ? 'When our primary inference provider is unavailable, Gorkie falls back to other models. Data might be used to improve the model.'
    : 'Gorkie only uses our primary inference provider. If it is unavailable, Gorkie may not be able to respond.';

  return [
    Blocks.Section({ text: `*Data Training*\n${description}` }).accessory(
      Elements.Button({
        text: allowDataTraining ? 'Disable' : 'Enable',
        actionId: 'home_toggle_data_training',
      }).danger(allowDataTraining)
    ),
  ];
}
