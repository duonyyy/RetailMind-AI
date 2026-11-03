# Implementation and verification checkpoint

Scope: correct the commerce/UI failures identified in the project audit before using a live model key.

## Implemented

- Inventory adjustment forwards authenticated credentials, fails on unconfirmed responses, and does not generate an audit hash.
- Catalog queries preserve an authoritative empty result and never substitute sample products on failure. Unknown product lookup returns null.
- Core catalog exposes real aggregate stock and no longer supplies invented CPU/RAM/storage values. Missing specifications remain unavailable (numeric legacy DTO fields use zero as an unknown sentinel).
- Product detail obtains branch stock from the inventory API. Catalog and compare stop initializing sample products.
- Cart loads and mutates the authenticated Core cart; it no longer owns a sample cart or local price preview.
- Checkout retains a pending key and binds it to the request intent. A changed intent is blocked while the previous outcome is unresolved.
- Receipt loads the authenticated order from Core and ignores URL payment/amount claims.
- Payment UI is explicitly simulated, contains no bank destination, and waits for Core. It does not assert a real bank transaction.
- Audit UI renders stored events without generating a chain in the browser. Admin pages no longer populate sample orders/products/inventory or model-quality metrics after errors.
- Unsupported admin order transitions do not mutate local state.
- Guest SSE identifies sessions as non-resumable; home chat does not reuse guest thread IDs.
- Compose forwards the model configuration variables the Agent actually reads.
- Architecture test uses internal-agent's public API. HTTP Agent tests supply operation IDs for sensitive requests and assert semantic failure states rather than obsolete refusal text.

## Executed in this change

- Core: 112 passed, 9 skipped (PostgreSQL fixture requires an isolated database).
- Agent unit + HTTP tests: 315 passed with provider/identity fixtures.
- Frontend: 17 passed; Next.js production build passed; TypeScript check passed after the final catalog validation change.

## Still required before calling the project complete

- Re-run PostgreSQL/HTTP fixtures and browser flows on these final changes. Docker CLI currently returns HTTP 500; no existing app database was changed.
- Verify login -> catalog -> cart -> preview -> checkout -> receipt, admin mutation denial/success and chat recovery against the full app, with durable Agent storage.
- A lost read-only chat response may still leave a pending operation requiring reconciliation; durable per-request receipts and authenticated account-scoped recovery are not implemented.
- Admin fulfillment transitions lack a Core endpoint and remain unavailable. The dashboard totals are page-scoped, not full-store analytics.
- Published/versioned/ACL-aware RAG and safe refund execution remain fail-closed under the previously selected scope; they are not implemented business flows.
- Live Gemini, true process restart, actual network loss after commit, deployment verification and production load tests have not run.

No API key is required for the outstanding local integration checks. Do not infer completion from a green unit suite or from adding a provider key.
