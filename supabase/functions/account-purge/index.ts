// DPDP account deletion, run by pg_cron (x-account-hook secret) or the service role. For each due request:
// 1) SQL guard re-checks blockers, 2) delete the user's files in every bucket (Storage API; SQL deletes are blocked),
// 3) anonymise rows in SQL, 4) scrub and ban the auth user (email/phone replaced, identities removed by the ban + rename).
// Financial rows stay, linked to the anonymous id, because tax law requires them.
import { admin, cors, json } from "../_shared/payments.ts";

const BUCKETS = ["avatars", "worker-docs", "kyc", "consult-files", "voice-notes"];

async function listAll(db: ReturnType<typeof admin>, bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (dir: string, depth: number) => {
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await db.storage.from(bucket).list(dir, { limit: 100, offset });
      if (error || !data?.length) return;
      for (const f of data) {
        const p = `${dir}/${f.name}`;
        if (f.id === null && depth < 4) await walk(p, depth + 1); else out.push(p);
      }
      if (data.length < 100) return;
    }
  };
  await walk(prefix, 0);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET") return json({ ok: true });
  if (req.method !== "POST") return json({ error: "method" }, 405);
  const db = admin();
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const isService = service.length > 0 && req.headers.get("Authorization") === `Bearer ${service}`;
  const hook = req.headers.get("x-account-hook");
  const isHook = !!hook && (await db.rpc("account_hook_ok", { _secret: hook })).data === true;
  if (!isService && !isHook) return json({ error: "forbidden" }, 403);

  const { data: due, error } = await db.rpc("account_purge_due", { _limit: 20 });
  if (error) return json({ error: error.message }, 500);
  const results: unknown[] = [];
  for (const r of (due ?? []) as { request_id: number; user_id: string; blockers: string[] }[]) {
    if (r.blockers?.length) { results.push({ id: r.request_id, waiting: r.blockers }); continue; }
    let files = 0;
    const sent = ((await db.rpc("account_user_files", { _u: r.user_id })).data ?? []) as { bucket: string; path: string }[];
    for (const b of BUCKETS) {
      const paths = [...await listAll(db, b, r.user_id), ...sent.filter((f) => f.bucket === b).map((f) => f.path)];
      for (let i = 0; i < paths.length; i += 100) {
        const { error: e } = await db.storage.from(b).remove(paths.slice(i, i + 100));
        if (!e) files += Math.min(100, paths.length - i);
      }
    }
    const an = await db.rpc("account_anonymize", { _request: r.request_id });
    if (an.error || !(an.data as { ok: boolean }).ok) { results.push({ id: r.request_id, error: an.error?.message ?? (an.data as { reason: string }).reason }); continue; }
    const u = await db.auth.admin.updateUserById(r.user_id, {
      email: `deleted-${r.user_id}@deleted.invalid`, phone: "", user_metadata: {}, app_metadata: { deleted: true }, ban_duration: "876000h",
    });
    results.push({ id: r.request_id, files, auth: u.error ? u.error.message : "scrubbed" });
  }
  return json({ ok: true, processed: results.length, results });
});
