export const actions = {
  add: 'home_mcp_add',
  auth: 'auth_input',
  connectBearer: 'home_mcp_connect_bearer',
  connectOAuth: 'home_mcp_connect_oauth',
  configure: 'home_mcp_configure',
  delete: 'home_mcp_delete',
  disable: 'home_mcp_disable',
  disconnect: 'home_mcp_disconnect',
  enable: 'home_mcp_enable',
  resetTools: 'home_mcp_reset_tools',
  setGroupMode: 'home_mcp_set_group_mode',
  approval: {
    allow: 'approval.allow',
    always: 'approval.always',
    deny: 'approval.deny',
  },
};

export const views = {
  add: 'home_mcp_save',
  bearer: 'home_mcp_bearer_save',
  configure: 'home_mcp_configure_save',
  oauth: 'home_mcp_connect_status',
};

export const blocks = {
  auth: 'auth_block',
  bearer: 'bearer_block',
  clientId: 'client_id_block',
  name: 'name_block',
  transport: 'transport_block',
  url: 'url_block',
};

export const inputs = {
  auth: 'auth_input',
  bearer: 'bearer_input',
  clientId: 'client_id_input',
  name: 'name_input',
  transport: 'transport_input',
  url: 'url_input',
  toolMode: 'tool_mode_input',
};
