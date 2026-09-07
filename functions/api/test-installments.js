/* ============================================================
   TEMPORARY DIAGNOSTIC — GET /api/test-installments
   Checks whether this Square account's plan supports splitting an
   invoice into a payment schedule (deposit + instalments). Creates a
   throwaway £1 test order + test customer + DRAFT invoice (never
   published, never sent, never charges anything), reads back whether
   Square accepted the multi-payment-request schedule, then deletes
   everything it created. Remove this file once the answer is known —
   it's not meant to ship.
   ============================================================ */

function j(obj, status) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: status || 200,
    headers: { "Content-Type": "application/json" }
  });
}

export async function onRequestGet(context) {
  const { env } = context;
  if (!env.SQUARE_ACCESS_TOKEN || !env.SQUARE_LOCATION_ID) {
    return j({ ok: false, step: "config", error: "Square credentials missing" }, 503);
  }

  const headers = {
    "Square-Version": "2026-08-19",
    "Authorization": `Bearer ${env.SQUARE_ACCESS_TOKEN}`,
    "Content-Type": "application/json"
  };

  const cleanup = { customerId: null, orderId: null, invoiceId: null, invoiceVersion: null };
  const log = [];

  try {
    // 1. Throwaway test customer
    const custRes = await fetch("https://connect.squareup.com/v2/customers", {
      method: "POST", headers,
      body: JSON.stringify({
        given_name: "PEACH STATE",
        family_name: "API DIAGNOSTIC - SAFE TO DELETE",
        note: "Created automatically to test invoice installment support. Safe to delete."
      })
    });
    const custData = await custRes.json();
    log.push({ step: "create_customer", ok: custRes.ok, status: custRes.status });
    if (!custRes.ok) return j({ ok: false, step: "create_customer", detail: custData, log }, 502);
    cleanup.customerId = custData.customer.id;

    // 2. Throwaway £1 test order (never completed/paid)
    const orderRes = await fetch("https://connect.squareup.com/v2/orders", {
      method: "POST", headers,
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        order: {
          location_id: env.SQUARE_LOCATION_ID,
          line_items: [{ name: "DIAGNOSTIC TEST - delete me", quantity: "1", base_price_money: { amount: 100, currency: "GBP" } }]
        }
      })
    });
    const orderData = await orderRes.json();
    log.push({ step: "create_order", ok: orderRes.ok, status: orderRes.status });
    if (!orderRes.ok) return j({ ok: false, step: "create_order", detail: orderData, log }, 502);
    cleanup.orderId = orderData.order.id;

    // 3. DRAFT invoice with a 2-part payment schedule (deposit + 1 instalment)
    //    Never published — this is the actual feature test.
    const invRes = await fetch("https://connect.squareup.com/v2/invoices", {
      method: "POST", headers,
      body: JSON.stringify({
        idempotency_key: crypto.randomUUID(),
        invoice: {
          location_id: env.SQUARE_LOCATION_ID,
          order_id: cleanup.orderId,
          primary_recipient: { customer_id: cleanup.customerId },
          payment_requests: [
            {
              request_type: "DEPOSIT",
              due_date: "2026-09-08",
              percentage_requested: "50"
            },
            {
              request_type: "BALANCE",
              due_date: "2026-10-08"
            }
          ],
          delivery_method: "EMAIL",
          accepted_payment_methods: { card: true }
        }
      })
    });
    const invData = await invRes.json();
    log.push({ step: "create_draft_invoice_with_schedule", ok: invRes.ok, status: invRes.status });

    if (invRes.ok) {
      cleanup.invoiceId = invData.invoice.id;
      cleanup.invoiceVersion = invData.invoice.version;
    }

    const result = {
      ok: invRes.ok,
      installmentsSupported: invRes.ok,
      detail: invRes.ok ? "Square accepted a DEPOSIT + BALANCE payment schedule on a draft invoice." : invData,
      log
    };

    // 4. Cleanup — delete the draft invoice, then the test order stays
    //    harmless (never completed/paid, doesn't show as a real sale).
    if (cleanup.invoiceId) {
      await fetch(`https://connect.squareup.com/v2/invoices/${cleanup.invoiceId}?version=${cleanup.invoiceVersion}`, {
        method: "DELETE", headers
      }).catch(() => {});
    }
    await fetch(`https://connect.squareup.com/v2/customers/${cleanup.customerId}`, {
      method: "DELETE", headers
    }).catch(() => {});

    return j(result);
  } catch (e) {
    return j({ ok: false, step: "exception", error: String(e), log }, 500);
  }
}
