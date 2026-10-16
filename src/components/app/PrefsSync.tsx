import { useEffect, useRef } from "react";
import { useTheme } from "next-themes";
import { useTranslation } from "react-i18next";
import { useProfile } from "@/features/profile/useProfile";

/** Applies the theme/language saved in the user's profile once after sign-in (device setting stays in localStorage). */
export function PrefsSync() {
  const { data } = useProfile(); const { setTheme } = useTheme(); const { i18n } = useTranslation();
  const done = useRef(false);
  useEffect(() => {
    if (!data || done.current) return;
    done.current = true;
    if (data.prefs?.theme) setTheme(data.prefs.theme);
    if (data.prefs?.lang && !i18n.language?.startsWith(data.prefs.lang)) i18n.changeLanguage(data.prefs.lang);
  }, [data, setTheme, i18n]);
  return null;
}
