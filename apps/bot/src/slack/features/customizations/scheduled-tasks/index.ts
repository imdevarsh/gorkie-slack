import * as cancelTask from './actions/cancel-task';

export const scheduledTasks = {
  buttonActions: [{ name: cancelTask.name, execute: cancelTask.execute }],
};
