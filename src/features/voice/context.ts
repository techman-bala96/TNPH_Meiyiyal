import { createContext, useContext } from "react";
export type VoiceState = "off" | "listening" | "thinking" | "speaking" | "error";
export const VoiceCtx = createContext<{ state: VoiceState; toggle: () => void; enabled: boolean }>({ state: "off", toggle: () => undefined, enabled: false });
export const useVoice = () => useContext(VoiceCtx);
