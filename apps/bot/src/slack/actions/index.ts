import { askUser } from '../features/ask-user';
import { customizations } from '../features/customizations';

export const actions = [...customizations.actions, ...askUser.actions];
