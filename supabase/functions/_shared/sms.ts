// SMS adapter. SMS_PROVIDER=mock (default; writes to public.sms_outbox for local viewing, sends nothing)
// or msg91 (MSG91 Flow API v5, DLT-registered templates).
//   MSG91_AUTH_KEY            account auth key (secret)
//   MSG91_SENDER_ID           6-letter DLT header, e.g. MEIYAL (set on the template in MSG91)
//   MSG91_TEMPLATE_LOGIN_OTP  MSG91 template id whose DLT text carries ##otp##  (sign-in OTP)
//   MSG91_TEMPLATE_STEPUP     MSG91 template id for bank-change / sensitive-action codes (##otp##)
// The DLT template text itself is registered on the operator portal (Jio/Airtel/Vi DLT) and mapped in MSG91.
// Field names follow MSG91's public Flow API docs at the time of writing; confirm on the dashboard.

export type SmsTemplate = "login_otp" | "stepup";
export interface SmsProvider { name: string; send(phone: string, template: SmsTemplate, vars: Record<string, string>): Promise<{ id: string | null }> }
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

/** E.164 India → MSG91's "91XXXXXXXXXX". Throws on anything that isn't an Indian mobile. */
export function msisdn(phone: string): string {
  const d = phone.replace(/\D/g, "");
  const n = d.length === 10 ? "91" + d : d.length === 12 && d.startsWith("91") ? d : d.length === 11 && d.startsWith("0") ? "91" + d.slice(1) : "";
  if (!/^91[6-9]\d{9}$/.test(n)) throw new Error("not an Indian mobile number");
  return n;
}

export class Msg91 implements SmsProvider {
  name = "msg91";
  private key: string; private templates: Record<SmsTemplate, string>; private sender: string | undefined; private fetcher: FetchLike;
  constructor(key: string, templates: Record<SmsTemplate, string>, sender?: string, fetcher: FetchLike = fetch) {
    this.key = key; this.templates = templates; this.sender = sender; this.fetcher = fetcher;
  }
  async send(phone: string, template: SmsTemplate, vars: Record<string, string>) {
    const tid = this.templates[template];
    if (!tid) throw new Error(`MSG91 template for ${template} is not set`);
    const res = await this.fetcher("https://control.msg91.com/api/v5/flow", {
      method: "POST",
      headers: { authkey: this.key, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ template_id: tid, short_url: "0", ...(this.sender ? { sender: this.sender } : {}), recipients: [{ mobiles: msisdn(phone), ...vars }] }),
    });
    const data = await res.json().catch(() => ({})) as { type?: string; message?: string; request_id?: string };
    if (!res.ok || data.type === "error") throw new Error(`msg91: ${data.message ?? res.status}`);
    return { id: data.request_id ?? data.message ?? null };
  }
}

export class MockSms implements SmsProvider {
  name = "mock";
  private sink: (row: { phone: string; template: SmsTemplate; vars: Record<string, string> }) => Promise<void>;
  constructor(sink: (row: { phone: string; template: SmsTemplate; vars: Record<string, string> }) => Promise<void>) { this.sink = sink; }
  async send(phone: string, template: SmsTemplate, vars: Record<string, string>) {
    msisdn(phone);
    await this.sink({ phone, template, vars });
    return { id: null };
  }
}

export function pickSms(env: (k: string) => string | undefined, sink: ConstructorParameters<typeof MockSms>[0], fetcher?: FetchLike): SmsProvider | null {
  const p = (env("SMS_PROVIDER") ?? "mock").toLowerCase();
  if (p === "msg91") {
    const key = env("MSG91_AUTH_KEY");
    if (!key) return null;
    return new Msg91(key, { login_otp: env("MSG91_TEMPLATE_LOGIN_OTP") ?? "", stepup: env("MSG91_TEMPLATE_STEPUP") ?? "" }, env("MSG91_SENDER_ID") || undefined, fetcher);
  }
  if (p === "mock") return new MockSms(sink);
  return null;
}
