// Payout provider. Mock when app_settings.payouts_mock is true (the local default).
// RazorpayX is selected only when mock is off AND RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET,
// and RAZORPAYX_ACCOUNT_NUMBER are set. This build does not call RazorpayX: those methods
// refuse instead of opening a network connection. Penny-drop suffix rules (0000 / 0001 / 0002)
// live in payout_account_submit so the SQL tests and this function share one result.
import { admin, cors, hmacHex, json, requireUser, safeEqual } from "./payments.ts";

export { admin, cors, hmacHex, json, requireUser };

export interface PayoutProvider {
  readonly name: "razorpayx" | "mock";
  verifyWebhook(rawBody: string, signature: string): Promise<boolean>;
}

/** Local gateway. Signs webhooks the same way the mock card gateway does. No HTTP. */
export class MockPayoutProvider implements PayoutProvider {
  readonly name = "mock" as const;
  readonly webhookSecret = Deno.env.get("MOCK_WEBHOOK_SECRET") ?? "mock_webhook_secret_local";
  async verifyWebhook(rawBody: string, signature: string) {
    return safeEqual(await hmacHex(this.webhookSecret, rawBody), signature);
  }
}

/** Present so the switch exists. Refuses every call until a later build wires the HTTP client. */
class RazorpayXProvider implements PayoutProvider {
  readonly name = "razorpayx" as const;
  async verifyWebhook(): Promise<boolean> {
    throw new Error("live_payouts_not_in_this_build");
  }
}

export async function pickPayoutProvider(): Promise<PayoutProvider | null> {
  const { data } = await admin().rpc("payouts_mock_enabled");
  if (data === true) return new MockPayoutProvider();
  const id = Deno.env.get("RAZORPAYX_KEY_ID");
  const secret = Deno.env.get("RAZORPAYX_KEY_SECRET");
  const account = Deno.env.get("RAZORPAYX_ACCOUNT_NUMBER");
  if (id && secret && account) return new RazorpayXProvider();
  return null;
}

export async function requireAdmin(req: Request) {
  const u = await requireUser(req);
  if (!u) return null;
  const { data, error } = await admin().from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").limit(1);
  if (error || !data?.length) return null;
  return u;
}
