import { createContext, useContext } from "react";
import type { Mode } from "./api";
export type Target = { id: string; display_name: string; photo_url: string | null; spec: string };
type Ctx = { request: (w: Target, mode: Mode) => Promise<void> };
export const ConsultCtx = createContext<Ctx>({ request: async () => undefined });
export const useConsult = () => useContext(ConsultCtx);
/** Push abstraction. In the app: Realtime ring + 5 s poll. App closed: standard Web Push (src/features/push/webPush.ts). */
export interface PushProvider { name: string; register(lang: string): Promise<string>; unregister(): Promise<void> }
