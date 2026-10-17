// Pluggable checkout UI: real Razorpay Checkout when the server picked "razorpay", the in-app mock sheet otherwise.
import type { CheckoutOrder, CheckoutSuccess } from "./api";

export type CheckoutResult = { kind: "success"; payload: CheckoutSuccess } | { kind: "failed"; reason: string } | { kind: "cancelled" };
export type MockOpener = (order: CheckoutOrder) => Promise<CheckoutResult>;

type RzpCtor = new (o: Record<string, unknown>) => { open(): void; on(ev: string, cb: (r: { error?: { description?: string } }) => void): void };
let rzpLoading: Promise<RzpCtor> | null = null;
function loadRazorpay(): Promise<RzpCtor> {
  const w = window as unknown as { Razorpay?: RzpCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return (rzpLoading ??= new Promise((res, rej) => {
    const s = document.createElement("script"); s.src = "https://checkout.razorpay.com/v1/checkout.js"; s.async = true;
    s.onload = () => (w.Razorpay ? res(w.Razorpay) : rej(new Error("Razorpay unavailable")));
    s.onerror = () => { rzpLoading = null; rej(new Error("Couldn't load Razorpay")); };
    document.head.appendChild(s);
  }));
}

export async function openCheckout(order: CheckoutOrder, opts: { name: string; description: string; color: string; openMock: MockOpener }): Promise<CheckoutResult> {
  if (order.provider === "mock") return opts.openMock(order);
  const Rzp = await loadRazorpay();
  return new Promise((resolve) => {
    let failed: string | null = null;
    const rzp = new Rzp({
      key: order.key_id, order_id: order.provider_order_id, amount: order.amount, currency: order.currency, name: opts.name, description: opts.description,
      prefill: { email: order.email ?? undefined, contact: order.phone ?? undefined }, theme: { color: opts.color },
      handler: (r: CheckoutSuccess) => resolve({ kind: "success", payload: r }),
      // Razorpay lets the user retry inside the modal after a failure; only report failure if they then close it
      modal: { ondismiss: () => resolve(failed ? { kind: "failed", reason: failed } : { kind: "cancelled" }) },
    });
    rzp.on("payment.failed", (r) => { failed = r.error?.description ?? "Payment failed"; });
    rzp.open();
  });
}
