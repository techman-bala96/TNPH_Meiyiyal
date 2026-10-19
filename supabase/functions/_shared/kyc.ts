// Aadhaar OTP e-KYC provider adapters. Used when app_settings.kyc_provider = 'edge'.
// The Aadhaar number never touches the database in clear: SQL stores a peppered hash + last 4.
//
// KYC_PROVIDER=mock      local/dev only. OTP is KYC_MOCK_OTP (default 123456). No network.
// KYC_PROVIDER=surepass  Surepass Aadhaar OTP (aadhaar-v2 generate-otp / submit-otp).
//                        Needs SUREPASS_TOKEN; SUREPASS_BASE_URL defaults to the production host.
//                        Field names follow Surepass's public docs at the time of writing —
//                        confirm against your Surepass dashboard before go-live.
// Anything else / unset  → null: the function answers 503 and the app shows "verification unavailable".
// Adding a vendor (Digio, IDfy, Signzy…) = one class implementing KycProvider.

export interface KycSendResult { ref: string }
export interface KycVerifyResult { ok: boolean; legalName?: string | null }
export interface KycProvider {
  name: string;
  sendOtp(aadhaar: string): Promise<KycSendResult>;
  verifyOtp(ref: string, otp: string): Promise<KycVerifyResult>;
}

export class MockKyc implements KycProvider {
  name = "mock";
  private otp: string;
  constructor(otp = "123456") { this.otp = otp; }
  async sendOtp(aadhaar: string) {
    if (aadhaar.endsWith("0000")) throw new Error("provider_rejected_number");
    return { ref: `mock-${crypto.randomUUID()}` };
  }
  async verifyOtp(_ref: string, otp: string) {
    return { ok: otp === this.otp, legalName: null };
  }
}

interface SurepassReply { success?: boolean; data?: { client_id?: string; otp_sent?: boolean; full_name?: string } }
type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class SurepassKyc implements KycProvider {
  name = "surepass";
  private token: string;
  private base: string;
  private fetcher: FetchLike;
  constructor(token: string, base = "https://kyc-api.surepass.io/api/v1", fetcher: FetchLike = fetch) {
    this.token = token; this.base = base; this.fetcher = fetcher;
  }
  private async call(path: string, body: unknown) {
    const res = await this.fetcher(`${this.base}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as SurepassReply };
  }
  async sendOtp(aadhaar: string) {
    const { status, data } = await this.call("/aadhaar-v2/generate-otp", { id_number: aadhaar });
    const ref = data?.data?.client_id;
    if (status >= 400 || !ref || data?.data?.otp_sent === false) throw new Error("provider_send_failed");
    return { ref: String(ref) };
  }
  async verifyOtp(ref: string, otp: string) {
    const { status, data } = await this.call("/aadhaar-v2/submit-otp", { client_id: ref, otp });
    if (status >= 400 || data?.success === false) return { ok: false };
    return { ok: true, legalName: typeof data?.data?.full_name === "string" ? data.data.full_name : null };
  }
}

export function pickKycProvider(env: (k: string) => string | undefined = (k) => Deno.env.get(k)): KycProvider | null {
  const p = (env("KYC_PROVIDER") ?? "").toLowerCase();
  if (p === "mock") return new MockKyc(env("KYC_MOCK_OTP") || "123456");
  if (p === "surepass") {
    const token = env("SUREPASS_TOKEN");
    if (!token) return null;
    return new SurepassKyc(token, env("SUREPASS_BASE_URL") || undefined);
  }
  return null;
}
