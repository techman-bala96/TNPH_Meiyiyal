import { createContext, useContext } from "react";
import type { Mode } from "./api";
export type Target = { id: string; display_name: string; photo_url: string | null; spec: string };
type Ctx = { request: (w: Target, mode: Mode) => Promise<void> };
export const ConsultCtx = createContext<Ctx>({ request: async () => undefined });
export const useConsult = () => useContext(ConsultCtx);
/** Push abstraction: in-app realtime today; an FCM provider can register a token and show OS notifications later. */
export interface PushProvider { name: string; register(userId: string): Promise<void> }
export const inAppPush: PushProvider = { name: "in-app-realtime", register: async () => undefined };
