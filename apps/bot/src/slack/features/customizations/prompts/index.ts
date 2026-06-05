import * as clearPrompt from './actions/clear-prompt';
import * as editPrompt from './actions/edit-prompt';
import * as loadPreset from './actions/modal-load-preset';
import * as togglePresets from './actions/toggle-presets';
import * as savePresetPrompt from './views/save-preset-prompt';
import * as savePrompt from './views/save-prompt';

export const prompts = {
  buttonActions: [
    { execute: editPrompt.execute, name: editPrompt.name },
    { execute: clearPrompt.execute, name: clearPrompt.name },
    { execute: togglePresets.execute, name: togglePresets.name },
    { execute: loadPreset.execute, name: loadPreset.name },
  ],
  submitViews: [
    { execute: savePrompt.execute, name: savePrompt.name },
    { execute: savePresetPrompt.execute, name: savePresetPrompt.name },
  ],
};
