import * as add from './actions/add';
import * as authChanged from './actions/auth-changed';
import * as connect from './actions/connect';
import * as deleteServer from './actions/delete';
import * as disconnect from './actions/disconnect';
import * as toggle from './actions/toggle';
import * as connectClosed from './views/connect-closed';
import * as save from './views/save';

export const mcp = {
  actions: [
    { execute: add.execute, name: add.name },
    { execute: authChanged.execute, name: authChanged.name },
    { execute: connect.execute, name: connect.name },
    { execute: deleteServer.execute, name: deleteServer.name },
    { execute: disconnect.execute, name: disconnect.name },
    { execute: toggle.execute, name: toggle.enableName },
    { execute: toggle.execute, name: toggle.disableName },
  ],
  views: [
    { execute: save.execute, name: save.name },
    { execute: connectClosed.execute, name: connectClosed.name },
  ],
};
