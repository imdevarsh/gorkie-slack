import {
  execute as clearPromptExecute,
  name as clearPromptName,
} from './actions/clear-prompt';
import {
  execute as editPromptExecute,
  name as editPromptName,
} from './actions/edit-prompt';
import {
  execute as modalSetPresetExecute,
  name as modalSetPresetName,
} from './actions/modal-set-preset';
import {
  execute as setPresetExecute,
  name as setPresetName,
} from './actions/set-preset';
import {
  execute as savePromptExecute,
  name as savePromptName,
} from './views/save-prompt';

export const prompts = {
  actions: [
    { name: editPromptName, execute: editPromptExecute },
    { name: clearPromptName, execute: clearPromptExecute },
    { name: setPresetName, execute: setPresetExecute },
    { name: modalSetPresetName, execute: modalSetPresetExecute },
  ],
  views: [{ name: savePromptName, execute: savePromptExecute }],
};
