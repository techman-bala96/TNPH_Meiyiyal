// Web Push on this device: support checks, subscribe / unsubscribe, and keeping the server row current.
// Standard Push API with our own VAPID key; no Firebase.
import { supabase } from "@/integrations/supabase/client";
import { canAskFrom, snoozed, type AskState } from "./askPace";
import type { PushProvider } from "@/features/consult/context";

export type PushSupport = {
  supported: boolean;     // this browser can receive push right now
  ios: boolean;
  standalone: boolean;    // opened from the Home Screen
  needsInstall: boolean;  // iPhone/iPad in a Safari tab: must "Add to Home Screen" first
  permission: NotificationPermission | "unsupported";
};

export function pushSupport(): PushSupport {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const ua = nav?.userAgent ?? "";
  const ios = /iPhone|iPad|iPod/.test(ua) || (nav?.platform === "MacIntel" && (nav?.maxTouchPoints ?? 0) > 1);
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (nav as Navigator & { standalone?: boolean })?.standalone === true);
  const api = typeof window !== "undefined" && "serviceWorker" in (nav ?? {}) && "PushManager" in window && "Notification" in window && window.isSecureContext;
  return {
    supported: !!api, ios, standalone: !!standalone,
    needsInstall: ios && !standalone,
    permission: api ? Notification.permission : "unsupported",
  };
}

const DEV_SW = "/dev-sw.js?dev-sw";
export async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/");
  if (existing) return existing;
  // production registers at start-up (main.tsx); dev registers only when push is first used
  if (import.meta.env.DEV) return navigator.serviceWorker.register(DEV_SW, { scope: "/", type: "module" });
  return navigator.serviceWorker.ready;
}

let keyPromise: Promise<string | null> | null = null;
/** VAPID public key: from the build env, else from the push-send function (GET). */
export function vapidPublicKey(): Promise<string | null> {
  const env = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (env) return Promise.resolve(env);
  keyPromise ??= supabase.functions.invoke("push-send", { method: "GET" })
    .then(({ data }) => (data?.publicKey as string | undefined) ?? null).catch(() => null);
  return keyPromise;
}

const toBytes = (b64u: string) => {
  const s = atob(b64u.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64u.length + 3) % 4));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
};
const platform = () => { const s = pushSupport(); return s.ios ? (s.standalone ? "ios-pwa" : "ios-safari") : /Android/.test(navigator.userAgent) ? "android" : "desktop"; };

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupport().supported) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function save(sub: PushSubscription, lang: string) {
  const j = sub.toJSON() as { endpoint: string; keys?: { p256dh?: string; auth?: string } };
  const { error } = await supabase.rpc("push_subscribe", { _endpoint: j.endpoint, _p256dh: j.keys?.p256dh, _auth: j.keys?.auth, _lang: lang, _platform: platform() });
  if (error) throw error;
}

export type EnableResult = "on" | "denied" | "unsupported" | "install" | "no_key";
/**
 * Call straight from a tap handler. The permission prompt must be the first thing that happens
 * (iPhone refuses a prompt that is not tied to a tap).
 */
export async function enablePush(lang: string): Promise<EnableResult> {
  const s = pushSupport();
  if (s.needsInstall) return "install";
  if (!s.supported) return "unsupported";
  const keyP = vapidPublicKey();
  const perm = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
  if (perm !== "granted") return "denied";
  const key = await keyP;
  if (!key) return "no_key";
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(key) });
  await save(sub, lang);
  return "on";
}

/** Turn off on this device (server row and browser subscription). Also used on sign-out. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return;
  await supabase.rpc("push_unsubscribe", { _endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}

/** On start-up / sign-in / language change: make sure the server knows this device (and its language). */
export async function syncPush(lang: string): Promise<boolean> {
  if (!pushSupport().supported || Notification.permission !== "granted") return false;
  const sub = await currentSubscription().catch(() => null);
  if (!sub) return false;
  await save(sub, lang).catch(() => undefined);
  return true;
}

/** Close any shown notification with this tag (e.g. the ring was answered in the app). */
export async function closeNotifications(tag: string) {
  if (!pushSupport().supported) return;
  const reg = await navigator.serviceWorker.getRegistration("/");
  const list = await reg?.getNotifications({ tag }).catch(() => []);
  list?.forEach((n) => n.close());
}

/** Nudge push-send (pg_net already does this; harmless if both run). */
export const kickPush = () => supabase.functions.invoke("push-send", { body: { kick: true } }).catch(() => undefined);

// ---------- "ask" pacing (rules in askPace.ts) ----------
const ASK_KEY = "myl.pushAsk";
function askState(): AskState | null { try { return JSON.parse(localStorage.getItem(ASK_KEY) ?? "null") as AskState | null; } catch { return null; } }
export function canAsk(now = Date.now()): boolean { return canAskFrom(askState(), now); }
export function snoozeAsk(now = Date.now()) { try { localStorage.setItem(ASK_KEY, JSON.stringify(snoozed(askState(), now))); } catch { /* private mode */ } }
export const REQUESTED_KEY = "myl.requestedOnce";

/** The PushProvider used by the app (see features/consult/context.ts). */
export const webPushProvider: PushProvider = { name: "web-push", register: (lang: string) => enablePush(lang), unregister: () => disablePush() };
