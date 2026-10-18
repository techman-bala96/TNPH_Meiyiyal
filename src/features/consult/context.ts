import { createContext, useContext } from "react";
import type { Mode } from "./api";
export type Target = { id: string; display_name: string; photo_url: string | null; spec: string; node?: string };
export type SearchArgs = { node: string; nodeLabel: string; mode: Mode; lat: number; lng: number };
type Ctx = {
  request: (w: Target, mode: Mode) => Promise<boolean>;
  /** auto request: ring the nearest available professionals one by one */
  startSearch: (a: SearchArgs) => Promise<void>;
  messageWorker: (w: { id: string; display_name: string; photo_url: string | null }) => void;
};
export const ConsultCtx = createContext<Ctx>({ request: async () => false, startSearch: async () => undefined, messageWorker: () => undefined });
export const useConsult = () => useContext(ConsultCtx);
/** Push abstraction. In the app: Realtime ring + 5 s poll. App closed: standard Web Push (src/features/push/webPush.ts). */
export interface PushProvider { name: string; register(lang: string): Promise<string>; unregister(): Promise<void> }
