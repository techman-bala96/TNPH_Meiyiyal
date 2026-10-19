// RazorpayX Payouts client (https://razorpay.com/docs/api/x/). Pure: no Deno globals, fetch injectable,
// so tests/unit can run it against a fake server. Endpoints used:
//   POST /v1/contacts                       create a contact for the worker
//   POST /v1/fund_accounts                  bank_account {name, ifsc, account_number} | vpa {address}
//   POST /v1/fund_accounts/validations      penny-drop (bank, ₹1) / VPA lookup → results.account_status, registered_name
//   GET  /v1/fund_accounts/validations/:id  poll a validation that is still "created"
//   POST /v1/payouts                        amount in paise, X-Payout-Idempotency = our payout id
// Webhooks: HMAC-SHA256(raw body, webhook secret) hex in X-Razorpay-Signature.
// Field names follow the public docs at the time of writing; confirm on the dashboard before go-live.

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface RazorpayXConfig { keyId: string; keySecret: string; accountNumber: string; base?: string; fetcher?: FetchLike }

export interface Validation { id: string; status: "created" | "completed" | "failed"; accountStatus: "active" | "invalid" | null; registeredName: string | null }
export interface PayoutResult { id: string; status: string; utr: string | null; failureReason: string | null }

export class RazorpayXError extends Error {
  status: number; code: string | null;
  constructor(status: number, code: string | null, message: string) { super(message); this.status = status; this.code = code; }
  /** 4xx (bad request / bad account) is permanent; 5xx, 429 and network errors are retried. */
  get retryable() { return this.status === 0 || this.status === 429 || this.status >= 500; }
}

const b64 = (s: string) => (typeof btoa === "function" ? btoa(s) : Buffer.from(s).toString("base64"));

export class RazorpayX {
  private auth: string; private base: string; private fetcher: FetchLike; readonly accountNumber: string;
  constructor(cfg: RazorpayXConfig) {
    this.auth = "Basic " + b64(`${cfg.keyId}:${cfg.keySecret}`);
    this.base = (cfg.base ?? "https://api.razorpay.com/v1").replace(/\/$/, "");
    this.fetcher = cfg.fetcher ?? fetch;
    this.accountNumber = cfg.accountNumber;
  }

  private async call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
    let res: Response;
    try {
      res = await this.fetcher(`${this.base}${path}`, {
        method, headers: { authorization: this.auth, "content-type": "application/json", ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (e) {
      throw new RazorpayXError(0, "network", (e as Error).message);
    }
    const data = await res.json().catch(() => ({})) as Record<string, unknown> & { error?: { code?: string; description?: string } };
    if (!res.ok) throw new RazorpayXError(res.status, data.error?.code ?? null, data.error?.description ?? `razorpayx ${res.status}`);
    return data;
  }

  async createContact(p: { name: string; referenceId: string; email?: string | null; phone?: string | null }) {
    const d = await this.call("POST", "/contacts", { name: p.name, type: "vendor", reference_id: p.referenceId,
      ...(p.email ? { email: p.email } : {}), ...(p.phone ? { contact: p.phone } : {}) });
    return String(d.id);
  }

  async createFundAccount(contactId: string, a: { kind: "bank"; name: string; ifsc: string; account: string } | { kind: "upi"; vpa: string }) {
    const body = a.kind === "bank"
      ? { contact_id: contactId, account_type: "bank_account", bank_account: { name: a.name, ifsc: a.ifsc, account_number: a.account } }
      : { contact_id: contactId, account_type: "vpa", vpa: { address: a.vpa } };
    const d = await this.call("POST", "/fund_accounts", body);
    return String(d.id);
  }

  private static toValidation(d: Record<string, unknown>): Validation {
    const r = (d.results ?? {}) as { account_status?: string; registered_name?: string };
    return { id: String(d.id), status: (d.status as Validation["status"]) ?? "created",
      accountStatus: r.account_status === "active" ? "active" : r.account_status ? "invalid" : null,
      registeredName: typeof r.registered_name === "string" ? r.registered_name : null };
  }

  async validate(fundAccountId: string, kind: "bank" | "upi", referenceId: string) {
    const d = await this.call("POST", "/fund_accounts/validations", {
      account_number: this.accountNumber, fund_account: { id: fundAccountId },
      ...(kind === "bank" ? { amount: 100, currency: "INR" } : {}), notes: { reference: referenceId },
    });
    return RazorpayX.toValidation(d);
  }

  async getValidation(id: string) { return RazorpayX.toValidation(await this.call("GET", `/fund_accounts/validations/${encodeURIComponent(id)}`)); }

  /** Validate and wait briefly; returns whatever state it reached (the webhook finishes a slow one). */
  async validateAndWait(fundAccountId: string, kind: "bank" | "upi", referenceId: string, waitMs = 8000, stepMs = 1000, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
    let v = await this.validate(fundAccountId, kind, referenceId);
    for (let t = 0; v.status === "created" && t < waitMs; t += stepMs) { await sleep(stepMs); v = await this.getValidation(v.id); }
    return v;
  }

  async createPayout(p: { payoutId: string; fundAccountId: string; amountRupees: number; kind: "bank" | "upi"; narration?: string }): Promise<PayoutResult> {
    const paise = Math.round(p.amountRupees * 100);
    if (!Number.isInteger(paise) || paise <= 0) throw new RazorpayXError(400, "amount", "bad amount");
    const d = await this.call("POST", "/payouts", {
      account_number: this.accountNumber, fund_account_id: p.fundAccountId, amount: paise, currency: "INR",
      mode: p.kind === "upi" ? "UPI" : "IMPS", purpose: "payout", queue_if_low_balance: true,
      reference_id: p.payoutId, narration: (p.narration ?? "Meiyiyal payout").slice(0, 30),
    }, { "X-Payout-Idempotency": p.payoutId });
    const sd = (d.status_details ?? {}) as { reason?: string };
    return { id: String(d.id), status: String(d.status), utr: typeof d.utr === "string" ? d.utr : null, failureReason: sd.reason ?? (typeof d.failure_reason === "string" ? d.failure_reason : null) };
  }
}

/** Map a RazorpayX payout status/reason to our webhook event vocabulary. */
export function payoutEventType(status: string): string | null {
  if (status === "processed") return "payout.processed";
  if (status === "failed" || status === "rejected" || status === "cancelled") return "payout.failed";
  if (status === "reversed") return "payout.reversed";
  return null; // queued / pending / processing: wait for the webhook
}

/** Our failure vocabulary: beneficiary/invalid_account are permanent, everything else retries. */
export function failureKind(reason: string | null | undefined): string {
  const r = (reason ?? "").toLowerCase();
  if (/offline|timeout|temporar|insufficient|balance|try again/.test(r)) return r ? "provider:" + r.slice(0, 60) : "provider";
  if (/invalid|closed|blocked|frozen|does not exist|incorrect|dormant/.test(r)) return "beneficiary";
  return r ? "provider:" + r.slice(0, 60) : "provider";
}
