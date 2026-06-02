import * as selectOption from './actions/select-option';
import * as submit from './views/submit';

export const askUser = {
  actions: [{ execute: selectOption.execute, name: selectOption.name }],
  views: [{ execute: submit.execute, name: submit.name }],
};
