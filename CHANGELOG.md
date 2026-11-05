# Changelog

## 0.1.0

- First release. Tools: list_stores, get_store, create_invoice, get_invoice, list_invoices. One server for all the stores of an account, one store key each.
- npx stablevoy-mcp login approves this computer in the Stablevoy dashboard (loopback redirect and PKCE) and keeps the keys in the user's config folder; stores and stores remove change the set; logout revokes them.
- STABLEVOY_API_KEY for one store without a login, STABLEVOY_MCP_READ_ONLY=true for read tools only.
