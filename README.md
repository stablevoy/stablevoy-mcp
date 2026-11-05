# stablevoy-mcp

An MCP server for [Stablevoy](https://stablevoy.com), the non-custodial USDT and USDC payment gateway. Ask your AI assistant to bill a client, check whether an invoice is paid or sum up the week, across all your stores:

- "Bill Acme 250 dollars for the October work" gives a payment link.
- "Has Acme paid?" gives the status and the transactions.
- "What came in this week in the Main store?" gives the list.

It works with Claude Desktop, Claude Code, Cursor and any client that speaks the Model Context Protocol. It runs on your computer and talks only to the Stablevoy API.

## What it can and cannot do

The server holds store API keys only. With them it can create invoices to receive money and read your stores and invoices. It cannot move funds, change your payout address, your webhooks, your limits, your keys or your stores: those need your wallet signature in the Stablevoy dashboard. Stablevoy never holds your money, so there is nothing to withdraw.

So even an assistant tricked by a malicious web page or document can only create invoices that pay you, and read your invoices. Reading is the real exposure: invoice amounts and your references. Keep that in mind before you connect the server to an assistant that also reads untrusted content, or run it read-only (below).

## Connect

Requires Node.js 22.12 or later.

```sh
npx stablevoy-mcp login
```

This opens the Stablevoy dashboard in your browser. Sign in with your wallet, tick the stores the assistant may use and approve. The browser hands a one-time code back to the command on this computer, which exchanges it for one API key per store and keeps them in your config folder (`~/.config/stablevoy-mcp` on Linux, `~/Library/Application Support/stablevoy-mcp` on macOS, `%APPDATA%\stablevoy-mcp` on Windows), readable by you only. The keys are named "MCP (your computer)" on the store pages of the dashboard, where you can revoke any of them.

Then add the server to your client.

Claude Desktop (`claude_desktop_config.json`), Cursor (`.cursor/mcp.json`) and most clients:

```json
{
  "mcpServers": {
    "stablevoy": { "command": "npx", "args": ["-y", "stablevoy-mcp"] }
  }
}
```

Claude Code:

```sh
claude mcp add stablevoy -- npx -y stablevoy-mcp
```

### One store without a login

Create a key on the store page of the dashboard and pass it instead:

```json
{
  "mcpServers": {
    "stablevoy": { "command": "npx", "args": ["-y", "stablevoy-mcp"], "env": { "STABLEVOY_API_KEY": "sk_live_..." } }
  }
}
```

### Read-only

Add `"STABLEVOY_MCP_READ_ONLY": "true"` to `env`: create_invoice is then not offered at all.

## Change the stores

- `npx stablevoy-mcp login` again: the stores this computer has are ticked; untick the ones to drop. Their keys are revoked, the new selection replaces the old one.
- `npx stablevoy-mcp stores` lists the stores of this computer; `npx stablevoy-mcp stores remove "Main"` drops one and revokes its key.
- `npx stablevoy-mcp logout` revokes every key of this computer and deletes the file.

Adding a store always goes through the browser, since it needs your wallet. The assistant cannot change the set. Several accounts or sets: `--profile work` on these commands, and `"STABLEVOY_MCP_PROFILE": "work"` in the client config.

## Tools

| Tool | What it does |
| --- | --- |
| list_stores | The connected stores, whether each can take payments and its EVM payout status. |
| get_store | A store's settings: networks, payout addresses, the EVM payout status, invoice limits, fee, website, return and webhook URLs. Read only. |
| create_invoice | An invoice for an amount in dollars ("19.99"), with an optional reference and return URL; returns the payment link. The same amount and reference return the same invoice instead of a second one. |
| get_invoice | An invoice by id, with the payments received. |
| list_invoices | Invoices newest first, filtered by status, source, search and the days they were created. |

With several stores, tools take a `store` argument (the id or the exact name from list_stores); the server asks for it rather than guessing.

## Configuration

| Variable | Meaning |
| --- | --- |
| STABLEVOY_API_KEY | One store key; when set, the login keys are not used. |
| STABLEVOY_MCP_PROFILE | Which login profile to use, `default` by default. |
| STABLEVOY_MCP_READ_ONLY | `true` leaves create_invoice out. |
| STABLEVOY_API_URL | The API, `https://api.stablevoy.com` by default. |

## License

MIT
