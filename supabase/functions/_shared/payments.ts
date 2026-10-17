// Pluggable payment provider. Razorpay when RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET are set, otherwise a local "mock"
// gateway (only when app_settings.payments_mock = true) that signs exactly like Razorpay so verify/webhook code is shared.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-razorpay-signature, x-razorpay-event-id",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
export const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const enc = new TextEncoder();
export async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}
/** constant-time compare */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export interface PaymentProvider {
  readonly name: "razorpay" | "mock";
  readonly keyId: string;                       // public key handed to Checkout
  createOrder(amountPaise: number, receipt: string): Promise<{ id: string }>;
  verifyPayment(orderId: string, paymentId: string, signature: string): Promise<boolean>;
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
}

class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;
  constructor(readonly keyId: string, private secret: string, private webhookSecret: string) {}
  async createOrder(amountPaise: number, receipt: string) {
    const r = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST", headers: { "content-type": "application/json", authorization: "Basic " + btoa(`${this.keyId}:${this.secret}`) },
      body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt, payment_capture: 1 }),
    });
    if (!r.ok) throw new Error(`razorpay order ${r.status}`);
    return { id: (await r.json()).id as string };
  }
  async verifyPayment(orderId: string, paymentId: string, signature: string) { return safeEqual(await hmacHex(this.secret, `${orderId}|${paymentId}`), signature); }
  async verifyWebhook(rawBody: string, signature: string) { return !!this.webhookSecret && safeEqual(await hmacHex(this.webhookSecret, rawBody), signature); }
}

export class MockProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly keyId = "rzp_mock_local";
  readonly secret = Deno.env.get("MOCK_PAYMENT_SECRET") ?? "mock_key_secret_local";
  readonly webhookSecret = Deno.env.get("MOCK_WEBHOOK_SECRET") ?? "mock_webhook_secret_local";
  async createOrder() { return { id: "order_mock_" + crypto.randomUUID().replaceAll("-", "").slice(0, 14) }; }
  async sign(orderId: string, paymentId: string) { return hmacHex(this.secret, `${orderId}|${paymentId}`); }
  async verifyPayment(orderId: string, paymentId: string, signature: string) { return safeEqual(await this.sign(orderId, paymentId), signature); }
  async verifyWebhook(rawBody: string, signature: string) { return safeEqual(await hmacHex(this.webhookSecret, rawBody), signature); }
}

export const admin = () => createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
export function asUser(req: Request): SupabaseClient {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
}
export async function requireUser(req: Request) {
  const sb = asUser(req);
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return { sb, user: data.user };
}

/** Razorpay if configured; else mock if the DB allows it; else null (payments unavailable). */
export async function pickProvider(): Promise<PaymentProvider | null> {
  const id = Deno.env.get("RAZORPAY_KEY_ID"), secret = Deno.env.get("RAZORPAY_KEY_SECRET");
  if (id && secret) return new RazorpayProvider(id, secret, Deno.env.get("RAZORPAY_WEBHOOK_SECRET") ?? "");
  const { data } = await admin().rpc("payments_mock_enabled");
  return data === true ? new MockProvider() : null;
}
