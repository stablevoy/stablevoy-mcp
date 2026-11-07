# Changelog

## 0.3.0

- New tool summarize_payments: totals of the invoices created in a period (last_7_days, last_30_days, this_month, last_month, last_3_months, or createdFrom and createdTo, at most 92 days per call): count per status, invoicedUsd, receivedUsd and the money per network and token. Without store and with several stores, each store and the total.
- New tool list_unmatched_transfers: payments to the Tron payout wallet that matched no invoice, each listed once with the stores it was seen for, sharedWithStores and the explorer link. Read only; the merchant attaches them in the dashboard.
- New tools search_docs and get_doc read the public Stablevoy documentation from the site's llms.txt (only the pages listed there, plus the API operations and the error catalog). They need no key, keep each page for an hour, wait at most 10 seconds and read at most 1 MB per page.
- Without a login and without STABLEVOY_API_KEY the server starts with the documentation tools only and says in its instructions and under each result that it is not signed in. Before, it did not start.
- Error hints for open_invoice_limit_reached and invalid_invoice_filter. New setting STABLEVOY_SITE_URL.
- Uses the stablevoy SDK 1.7.0.

## 0.2.0

- New tool cancel_invoice: cancels an invoice no payment has been seen for, so the payment page tells the buyer not to pay and the shop gets the invoice.cancelled webhook. A paid or partly paid invoice is refused with invoice_not_cancellable; money that still arrives after a cancel marks the invoice paid_late. Without store it is tried in each connected store, and only the store that owns the invoice can cancel it. Not offered in read-only mode.
- create_invoice takes expiresInMinutes, how long the buyer has to pay (15 to 10080 minutes; the store default when left out), and its description says what expiresAt means and that the payment link is sent to the buyer by you.
- Error hints for invoice_not_cancellable, invalid_invoice_lifetime and conflict.
- Tool descriptions say that each call uses the store's API key and how failures come back, when to pass store, the list_invoices filters with their formats, and that a changed amount means cancelling the unpaid invoice first. list_invoices accepts the status cancelled.
- Uses the stablevoy SDK 1.6.0.

## 0.1.2

- Clearer tool descriptions: each one says what it returns, when to use it and which tool to use instead, and get_invoice and list_invoices say what happens when nothing is found. Tool names, inputs and behavior are unchanged.

## 0.1.1

- After npx stablevoy-mcp login the browser lands on a page of the Stablevoy site that shows the real result: connected only once the keys are saved, otherwise failed, or mismatch for a link of another login. Before, a bare page said connected as soon as the code arrived, even when the exchange then failed.

## 0.1.0

- First release. Tools: list_stores, get_store, create_invoice, get_invoice, list_invoices. One server for all the stores of an account, one store key each.
- npx stablevoy-mcp login approves this computer in the Stablevoy dashboard (loopback redirect and PKCE) and keeps the keys in the user's config folder; stores and stores remove change the set; logout revokes them.
- STABLEVOY_API_KEY for one store without a login, STABLEVOY_MCP_READ_ONLY=true for read tools only.
