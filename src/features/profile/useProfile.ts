import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type Prefs = { theme?: "light" | "dark" | "system"; lang?: "en" | "ta"; notify?: NotifyPrefs };
export type NotifyPrefs = { requests?: boolean; chat?: boolean; money?: boolean; account?: boolean; promos?: boolean; admin?: boolean;
  quiet?: { on?: boolean; from?: string; to?: string } };
export type Profile = { user_id: string; full_name: string | null; email: string | null; phone_number: string | null; avatar_url: string | null; dob: string | null; prefs: Prefs };

export function useProfile() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["profile", user?.id], enabled: !!user,
    queryFn: async (): Promise<Profile> => {
      const { data, error } = await supabase.from("profiles").select("user_id,full_name,email,phone_number,avatar_url,dob,prefs").eq("user_id", user!.id).maybeSingle();
      if (error) throw error;
      if (data) return data as Profile;
      const row = { user_id: user!.id, email: user!.email ?? null, phone_number: user!.phone ? `+${user!.phone}` : null };
      const ins = await supabase.from("profiles").insert(row).select("user_id,full_name,email,phone_number,avatar_url,dob,prefs").single();
      if (ins.error) throw ins.error;
      return ins.data as Profile;
    },
  });
}

export function useUpdateProfile() {
  const qc = useQueryClient(); const { user } = useAuth();
  return async (patch: Partial<Omit<Profile, "user_id" | "email">>) => {
    const { error } = await supabase.from("profiles").update(patch).eq("user_id", user!.id);
    if (error) throw error;
    await qc.invalidateQueries({ queryKey: ["profile", user?.id] });
  };
}

/** Resize to max 512px square-ish and encode WebP (~<150 KB) before upload. */
export async function compressImage(file: File, max = 512, quality = 0.85): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("encode"))), "image/webp", quality));
}

export async function uploadAvatar(userId: string, file: File) {
  const blob = await compressImage(file);
  const path = `${userId}/avatar-${Date.now()}.webp`;
  const { error } = await supabase.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: true });
  if (error) throw error;
  return supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
}

export const initials = (name?: string | null, fallback?: string | null) => {
  const src = (name || fallback || "?").replace(/@.*/, "").trim();
  const parts = src.split(/[\s._+-]+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
};
