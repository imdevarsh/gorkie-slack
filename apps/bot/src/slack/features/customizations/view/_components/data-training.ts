import { Blocks, Elements } from 'slack-block-builder';

export function dataTrainingBlocks(allowDataTraining: boolean) {
  const description = allowDataTraining
    ? 'When Hack Club AI is unavailable, Gorkie can use fallback models.'
    : 'Gorkie only uses Hack Club AI. If it is unavailable, Gorkie may not be able to respond.';

  return [
    Blocks.Section({ text: `*Data Training*\n${description}` }).accessory(
      Elements.Button({
        text: allowDataTraining ? 'Disable' : 'Enable',
        actionId: 'home_toggle_data_training',
      }).danger(allowDataTraining)
    ),
  ];
}
