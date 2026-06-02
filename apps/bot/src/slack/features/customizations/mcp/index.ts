import * as approval from './actions/approval';
import * as authChanged from './actions/auth-changed';
import * as configure from './actions/configure';
import * as connect from './actions/connect';
import * as deleteServer from './actions/delete';
import * as disconnect from './actions/disconnect';
import * as toggle from './actions/toggle';
import { actions, inputs } from './ids';
import type { ButtonArgs, SelectArgs } from './types';
import { addModal } from './view';
import * as connectClosed from './views/connect-closed';
import * as save from './views/save';
import * as saveBearer from './views/save-bearer';
import * as saveTools from './views/save-tools';

async function addServer({ ack, body, client }: ButtonArgs): Promise<void> {
  await ack();
  await client.views.open({
    trigger_id: body.trigger_id,
    view: addModal(),
  });
}

async function acknowledgeToolMode({ ack }: SelectArgs): Promise<void> {
  await ack();
}

export const mcp = {
  buttonActions: [
    { execute: addServer, name: actions.add },
    { execute: approval.execute, name: approval.approveName },
    { execute: approval.execute, name: approval.alwaysThreadName },
    { execute: approval.execute, name: approval.denyName },
    { execute: configure.execute, name: configure.name },
    { execute: connect.execute, name: connect.name },
    { execute: deleteServer.execute, name: deleteServer.name },
    { execute: disconnect.execute, name: disconnect.name },
    { execute: toggle.execute, name: toggle.enableName },
    { execute: toggle.execute, name: toggle.disableName },
  ],
  selectActions: [
    { execute: authChanged.execute, name: authChanged.name },
    { execute: acknowledgeToolMode, name: inputs.toolMode },
  ],
  submitViews: [
    { execute: saveBearer.execute, name: saveBearer.name },
    { execute: saveTools.execute, name: saveTools.name },
    { execute: save.execute, name: save.name },
  ],
  closedViews: [{ execute: connectClosed.execute, name: connectClosed.name }],
};
