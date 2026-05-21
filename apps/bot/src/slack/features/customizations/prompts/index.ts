import * as clearPrompt from "./actions/clear-prompt";
import * as editPrompt from "./actions/edit-prompt";
import * as modalLoadPreset from "./actions/modal-load-preset";
import * as modalTogglePresets from "./actions/modal-toggle-presets";
import * as savePresetPrompt from "./views/save-preset-prompt";
import * as savePrompt from "./views/save-prompt";

export const prompts = {
  actions: [
    { name: editPrompt.name, execute: editPrompt.execute },
    { name: clearPrompt.name, execute: clearPrompt.execute },
    { name: modalTogglePresets.name, execute: modalTogglePresets.execute },
    { name: modalLoadPreset.name, execute: modalLoadPreset.execute },
  ],
  views: [
    { name: savePrompt.name, execute: savePrompt.execute },
    { name: savePresetPrompt.name, execute: savePresetPrompt.execute },
  ],
};
