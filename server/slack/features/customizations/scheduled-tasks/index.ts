import * as cancelTask from './actions/cancel-task';

export const scheduledTasks = {
  actions: [{ name: cancelTask.name, execute: cancelTask.execute }],
};
