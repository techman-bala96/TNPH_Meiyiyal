import { admin } from "./payments.ts";
import { pickSms } from "./sms.ts";

/** The SMS provider for Edge Functions. Mock rows land in public.sms_outbox (service role only). */
export const sms = () => pickSms((k) => Deno.env.get(k), async (r) => {
  const { error } = await admin().from("sms_outbox").insert({ phone: r.phone, template: r.template, vars: r.vars });
  if (error) throw new Error(error.message);
});
