import { expect, test, type Browser, type Page } from "@playwright/test";
import { mockMapNetwork } from "./mocks";
import { setProfile, signInAt, sql } from "./workerFlow";

export const CHENNAI = { latitude: 13.0317, longitude: 80.27 };
export const SHOTS = process.env.SHOTS_DIR ?? "../meyiyal/screens";
export const shot = (page: Page, name: string, fullPage = false) => {
  const p = test.info().project.name;
  return page.screenshot({ path: `${SHOTS}/${p === "mobile" ? "" : "desktop-"}${name}.png`, fullPage });
};
export async function open(browser: Browser, at = CHENNAI) {
  const ctx = await browser.newContext({ ...test.info().project.use, geolocation: at, permissions: ["geolocation", "camera", "microphone"], acceptDownloads: true });
  const page = await ctx.newPage(); await mockMapNetwork(page);
  await page.addInitScript(() => { if (!localStorage.getItem("i18nextLng")) localStorage.setItem("i18nextLng", "en"); });
  return { ctx, page };
}
/** Account + profile via real UI; worker row approved directly (registration+approval UI is covered by worker-reg/marketplace specs). */
export async function makeWorker(browser: Browser, prefix: string, name: string, photo: string, node: string, at: { latitude: number; longitude: number }, district: string) {
  const s = await open(browser, at);
  const email = await signInAt(s.page, s.page.request, prefix);
  await setProfile(s.page, name, photo);
  sql(`SELECT set_config('meiyiyal.trusted','on',false);
    INSERT INTO public.workers(user_id,display_name,photo_url,primary_node,locked_category,status,is_active,is_verified,base_geog,district_slug,years_experience,submitted_at,decided_at,reg_data)
    SELECT u.id, '${name}', p.avatar_url, '${node}', public.node_category('${node}'), 'approved', true, true, ST_SetSRID(ST_MakePoint(${at.longitude},${at.latitude}),4326)::geography, '${district}', 10, now(), now(),
      '{"council":"Tamil Nadu Medical Council (TNMC)","bar_council":"Bar Council of Tamil Nadu & Puducherry"}'::jsonb - CASE WHEN '${node}' LIKE '%lawyer%' THEN 'council' ELSE 'bar_council' END
    FROM auth.users u LEFT JOIN public.profiles p ON p.user_id=u.id WHERE u.email='${email}'
    ON CONFLICT (user_id) DO UPDATE SET status='approved', primary_node=EXCLUDED.primary_node, photo_url=EXCLUDED.photo_url;
    INSERT INTO public.worker_nodes(worker_id,node_slug,is_primary) SELECT w.id,'${node}',true FROM public.workers w JOIN auth.users u ON u.id=w.user_id WHERE u.email='${email}' ON CONFLICT DO NOTHING;`);
  await s.page.goto("/?tab=worker");
  await expect(s.page.getByTestId("worker-status")).toHaveAttribute("data-status", "approved");
  await s.page.getByTestId("go-online").click();
  await expect(s.page.getByTestId("go-online")).toBeChecked();
  const id = sql(`SELECT w.id FROM public.workers w JOIN auth.users u ON u.id=w.user_id WHERE u.email='${email}'`);
  return { ...s, email, id };
}
/** An already-finished session (fast path for multi-session scenarios); feedback on it is then given through the real UI. */
export const endedSession = (userEmail: string, workerEmail: string) => sql(`WITH s AS (
  INSERT INTO public.consult_sessions(user_id,worker_id,worker_user_id,node_slug,credits_used,status,started_at,ended_at,end_reason)
  SELECT u.id, w.id, w.user_id, w.primary_node, 10, 'ended', now()-interval '6 min', now(), 'ended'
  FROM auth.users u, public.workers w JOIN auth.users wu ON wu.id=w.user_id WHERE u.email='${userEmail}' AND wu.email='${workerEmail}' RETURNING id) SELECT id FROM s;`).split("\n")[0];
export const cardOf = (page: import("@playwright/test").Page, id: string) => page.locator(`[data-testid="worker-card"][data-id="${id}"]`);
