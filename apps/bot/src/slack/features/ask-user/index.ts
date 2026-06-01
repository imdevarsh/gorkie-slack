import * as selectOption from './actions/select-option';

export const askUser = {
  actions: [{ execute: selectOption.execute, name: selectOption.name }],
};
