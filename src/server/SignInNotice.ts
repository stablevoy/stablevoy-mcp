/** Said in the server instructions and under every docs result when the server has no store key. */
export const NOT_SIGNED_IN =
  'Not signed in: the store tools answer not_signed_in until the merchant runs npx stablevoy-mcp login or sets STABLEVOY_API_KEY. The documentation tools, the docs resources and the getting_started prompt work without a key.';

/** The tool error every store tool answers on a server without a store key. */
export const NOT_SIGNED_IN_ERROR =
  'not_signed_in: Stablevoy is not connected on this computer. Run npx stablevoy-mcp login, or set STABLEVOY_API_KEY in the MCP client config.';
