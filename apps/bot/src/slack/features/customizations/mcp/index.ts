import * as add from './actions/add';
import * as connect from './actions/connect';
import * as deleteServer from './actions/delete';
import * as disconnect from './actions/disconnect';
import * as refresh from './actions/refresh';
import * as toggle from './actions/toggle';
import * as save from './views/save';

export const mcp = {
  actions: [
    { execute: add.execute, name: add.name },
    { execute: connect.execute, name: connect.name },
    { execute: deleteServer.execute, name: deleteServer.name },
    { execute: disconnect.execute, name: disconnect.name },
    { execute: refresh.execute, name: refresh.name },
    { execute: toggle.execute, name: toggle.enableName },
    { execute: toggle.execute, name: toggle.disableName },
  ],
  views: [{ execute: save.execute, name: save.name }],
};
