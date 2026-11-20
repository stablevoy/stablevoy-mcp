import type { Currency } from 'stablevoy';
import { centsOf, minorUnitsOf } from './AmountUsd.js';

/** What create_invoice sends: a dollar price, or a price in the shop currency; key is the idempotency key part. */
export type InvoicePrice = { readonly body: { amountUsdCents: number } | { amount: number; currency: string }; readonly key: number | string };

export type PriceArgs = { readonly amountUsd?: string | undefined; readonly amount?: string | undefined; readonly currency?: string | undefined };

/** The price the model gave, checked before any request; a price in another currency still needs its exponent. */
export type PriceForm = { readonly price: InvoicePrice } | { readonly amount: string; readonly currency: string } | { readonly error: string };

export function priceFormOf(args: PriceArgs): PriceForm {
  const inCurrency = args.amount !== undefined || args.currency !== undefined;
  if (args.amountUsd !== undefined && inCurrency) return { error: 'invalid_price: give amountUsd, or amount with currency, not both.' };
  if (args.amountUsd !== undefined) {
    const price = usdPriceOf(args.amountUsd);
    return typeof price === 'string' ? { error: price } : { price };
  }
  if (args.amount === undefined || args.currency === undefined) return { error: 'invalid_price: give amountUsd, or amount with currency.' };
  return { amount: args.amount, currency: args.currency };
}

export function usdPriceOf(amountUsd: string): InvoicePrice | string {
  const cents = centsOf(amountUsd);
  if (cents === null || cents === 0) return 'invalid_amount: amountUsd must be a positive amount in dollars with at most two decimals, for example "19.99".';
  return { body: { amountUsdCents: cents }, key: cents };
}

/** amount in currency to its smallest unit, by the exponent the API gives for that currency (0 for JPY). */
export function currencyPriceOf(amount: string, currency: string, currencies: readonly Currency[]): InvoicePrice | string {
  const code = currency.trim().toUpperCase();
  const known = currencies.find((c) => c.code === code);
  if (known === undefined) return `currency_not_supported: ${code.slice(0, 8)} is not supported; use one of ${currencies.map((c) => c.code).join(', ')}.`;
  const units = minorUnitsOf(amount, known.exponent);
  if (units === null || units === 0) return `invalid_amount: amount must be a positive amount in ${code} with at most ${known.exponent} decimals.`;
  return { body: { amount: units, currency: code }, key: `${units} ${code}` };
}
