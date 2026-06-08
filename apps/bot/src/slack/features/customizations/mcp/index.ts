import * as approval from './actions/approval';
import * as authChanged from './actions/auth-changed';
import * as configure from './actions/configure';
import * as connectBearer from './actions/connect-bearer';
import * as connectOAuth from './actions/connect-oauth';
import * as deleteServer from './actions/delete';
import * as disconnect from './actions/disconnect';
import * as resetTools from './actions/reset-tools';
import * as saveToolMode from './actions/save-tool-mode';
import * as searchTools from './actions/search-tools';
import * as setGroupMode from './actions/set-group-mode';
import * as toggle from './actions/toggle';
import * as toggleGroup from './actions/toggle-group';
import { actions } from './ids';
import type { ButtonArgs } from './types';
import { addModal } from './view';
import * as oauthClosed from './views/oauth-closed';
import * as save from './views/save';
import * as saveBearer from './views/save-bearer';
import * as saveTools from './views/save-tools';

export const mcp = {
  buttonActions: [
    {
      execute: async ({ ack, body, client }: ButtonArgs) => {
        await ack();
        await client.views.open({
          trigger_id: body.trigger_id,
          view: addModal(),
        });
      },
      name: actions.add,
    },
    { execute: approval.execute, name: actions.approval.allow },
    { execute: approval.execute, name: actions.approval.always },
    { execute: approval.execute, name: actions.approval.deny },
    { execute: configure.execute, name: configure.name },
    { execute: connectBearer.execute, name: connectBearer.name },
    { execute: connectOAuth.execute, name: connectOAuth.name },
    { execute: deleteServer.execute, name: deleteServer.name },
    { execute: disconnect.execute, name: disconnect.name },
    { execute: toggleGroup.execute, name: toggleGroup.name },
    { execute: resetTools.execute, name: resetTools.name },
    { execute: toggle.execute, name: toggle.enableName },
    { execute: toggle.execute, name: toggle.disableName },
  ],
  inputActions: [{ execute: searchTools.execute, name: searchTools.name }],
  selectActions: [
    { execute: authChanged.execute, name: authChanged.name },
    { execute: saveToolMode.execute, name: saveToolMode.name },
    { execute: setGroupMode.execute, name: setGroupMode.name },
  ],
  submitViews: [
    { execute: saveBearer.execute, name: saveBearer.name },
    { execute: saveTools.execute, name: saveTools.name },
    { execute: save.execute, name: save.name },
  ],
  closedViews: [{ execute: oauthClosed.execute, name: oauthClosed.name }],
};
