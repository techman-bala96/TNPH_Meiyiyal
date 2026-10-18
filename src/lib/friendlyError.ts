import type { TFunction } from "i18next";

/**
 * Server messages (Postgres RAISE / Edge Functions) are English and technical. People see a short
 * sentence in their language instead; the raw text is still logged for support.
 */
const TABLE: [RegExp, string][] = [
  [/worker busy|finish your current (session|consultation) first/i, "busy"],
  [/worker offline/i, "offline"],
  [/worker unavailable|worker not found|not approved yet/i, "unavailable"],
  [/already have a ringing request/i, "alreadyRinging"],
  [/already have a search running/i, "searchRunning"],
  [/too many (requests|attempts|OTP requests|account checks)|rate limit|only request this after/i, "tooMany"],
  [/asked twice already/i, "askedTwice"],
  [/wait a minute before asking again/i, "waitMinute"],
  [/cannot request yourself/i, "self"],
  [/no rate configured/i, "noRate"],
  [/session ended|not active/i, "sessionEnded"],
  [/not authenticated|sign in first|JWT expired|invalid jwt|refresh token/i, "signIn"],
  [/OTP expired|send OTP first/i, "otpExpired"],
  [/step-up code did not match|invalid otp|token has expired or is invalid/i, "badCode"],
  [/registration is locked while/i, "regLocked"],
  [/profession is locked|already registered as|profession cannot be changed/i, "profLocked"],
  [/pick a sub-category|missing: /i, "regMissing"],
  [/daily message limit/i, "msgDaily"],
  [/message too long/i, "msgTooLong"],
  [/not taking messages from you/i, "msgBlocked"],
  [/insufficient credits|not enough credits/i, "lowCredits"],
  [/invalid IFSC/i, "ifsc"],
  [/invalid UPI id/i, "upi"],
  [/invalid account number/i, "account"],
  [/invalid aadhaar/i, "aadhaar"],
  [/invalid PAN/i, "pan"],
  [/a payout is already pending/i, "payoutPending"],
  [/payload too large|exceeded the maximum allowed size|file too large|413/i, "fileTooBig"],
  [/mime type|not supported|invalid file type/i, "fileType"],
  [/failed to fetch|network|load failed|fetch failed|timeout/i, "network"],
];

export function friendlyKey(msg: string | null | undefined): string | null {
  const m = msg ?? "";
  for (const [re, key] of TABLE) if (re.test(m)) return key;
  return null;
}

export function friendlyError(t: TFunction, msg: string | null | undefined, vars: Record<string, unknown> = {}): string {
  const key = friendlyKey(msg);
  if (msg) console.warn("[server]", msg);
  return key ? t(`errors.${key}`, { name: t("errors.thisPerson"), ...vars }) : t("errors.generic");
}
