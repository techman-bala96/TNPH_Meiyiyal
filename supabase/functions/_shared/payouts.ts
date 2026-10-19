// Payout provider. Mock when app_settings.payouts_mock is true (the local default).
// RazorpayX when mock is off AND RAZORPAYX_KEY_ID, RAZORPAYX_KEY_SECRET, RAZORPAYX_ACCOUNT_NUMBER are set
// (RAZORPAYX_WEBHOOK_SECRET for webhooks). Otherwise null → the functions answer 503.
// Mock penny-drop suffix rules (0000 / 0001 / 0002) live in payout_account_submit so SQL tests share them.
import { admin, cors, hmacHex, json, requireUser, safeEqual } from "./payments.ts";
import { RazorpayX } from "./razorpayx.ts";

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

export class RazorpayXProvider implements PayoutProvider {
  readonly name = "razorpayx" as const;
  readonly rx: RazorpayX;
  private webhookSecret: string;
  constructor(rx: RazorpayX, webhookSecret: string) { this.rx = rx; this.webhookSecret = webhookSecret; }
  async verifyWebhook(rawBody: string, signature: string) {
    if (!this.webhookSecret) return false;
    return safeEqual(await hmacHex(this.webhookSecret, rawBody), signature);
  }
}

export async function pickPayoutProvider(): Promise<PayoutProvider | null> {
  const { data } = await admin().rpc("payouts_mock_enabled");
  if (data === true) return new MockPayoutProvider();
  const keyId = Deno.env.get("RAZORPAYX_KEY_ID");
  const keySecret = Deno.env.get("RAZORPAYX_KEY_SECRET");
  const accountNumber = Deno.env.get("RAZORPAYX_ACCOUNT_NUMBER");
  if (keyId && keySecret && accountNumber) {
    return new RazorpayXProvider(new RazorpayX({ keyId, keySecret, accountNumber, base: Deno.env.get("RAZORPAYX_BASE_URL") || undefined }),
      Deno.env.get("RAZORPAYX_WEBHOOK_SECRET") ?? "");
  }
  return null;
}

export async function requireAdmin(req: Request) {
  const u = await requireUser(req);
  if (!u) return null;
  const { data, error } = await admin().from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").limit(1);
  if (error || !data?.length) return null;
  return u;
}
