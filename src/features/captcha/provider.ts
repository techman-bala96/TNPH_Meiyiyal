// Captcha adapter. Supabase Auth checks the token server-side when [auth.captcha] is enabled (config.toml / dashboard),
// so the client only has to collect one. Providers: none (default), mock (test widget, no network), turnstile, hcaptcha.
export type CaptchaProvider = "none" | "mock" | "turnstile" | "hcaptcha";
const ALL: CaptchaProvider[] = ["none", "mock", "turnstile", "hcaptcha"];

export function resolveCaptcha(envProvider: string | undefined, siteKey: string | undefined, devOverride: string | null, isDev: boolean): { provider: CaptchaProvider; siteKey: string } {
  let p = (envProvider || "none").toLowerCase() as CaptchaProvider;
  if (isDev && devOverride && ALL.includes(devOverride as CaptchaProvider)) p = devOverride as CaptchaProvider;
  if (!ALL.includes(p)) p = "none";
  // A real provider without a site key cannot render; fall back to none rather than lock everyone out.
  if ((p === "turnstile" || p === "hcaptcha") && !siteKey) p = "none";
  return { provider: p, siteKey: siteKey || "" };
}

export function captchaConfig() {
  let o: string | null = null; try { o = localStorage.getItem("meiyiyal-captcha"); } catch { /* ignore */ }
  return resolveCaptcha(import.meta.env.VITE_CAPTCHA_PROVIDER as string | undefined, import.meta.env.VITE_CAPTCHA_SITE_KEY as string | undefined, o, import.meta.env.DEV);
}

export const MOCK_TOKEN_PREFIX = "mock-captcha-";
export const SCRIPTS: Record<"turnstile" | "hcaptcha", string> = {
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
};
