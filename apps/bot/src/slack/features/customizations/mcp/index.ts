import * as add from './actions/add';
import * as approval from './actions/approval';
import * as authChanged from './actions/auth-changed';
import * as configure from './actions/configure';
import * as connect from './actions/connect';
import * as deleteServer from './actions/delete';
import * as disconnect from './actions/disconnect';
import * as toggle from './actions/toggle';
import * as connectClosed from './views/connect-closed';
import * as save from './views/save';
import * as saveBearer from './views/save-bearer';
import * as saveTools from './views/save-tools';

export const mcp = {
  actions: [
    { execute: add.execute, name: add.name },
    { execute: approval.execute, name: approval.approveName },
    { execute: approval.execute, name: approval.alwaysThreadName },
    { execute: approval.execute, name: approval.denyName },
    { execute: authChanged.execute, name: authChanged.name },
    { execute: configure.execute, name: configure.name },
    { execute: connect.execute, name: connect.name },
    { execute: deleteServer.execute, name: deleteServer.name },
    { execute: disconnect.execute, name: disconnect.name },
    { execute: toggle.execute, name: toggle.enableName },
    { execute: toggle.execute, name: toggle.disableName },
  ],
  views: [
    { execute: saveBearer.execute, name: saveBearer.name },
    { execute: saveTools.execute, name: saveTools.name },
    { execute: save.execute, name: save.name },
    {
      execute: connectClosed.execute,
      name: connectClosed.name,
      viewType: connectClosed.viewType,
    },
  ],
};
