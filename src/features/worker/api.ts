import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadAvatar } from "@/features/profile/useProfile";
import type { I18nName } from "@/features/taxonomy/useTaxonomy";

export type ReqField = { key: string; label: I18nName; type: "text" | "select" | "year" | "date"; required: boolean; options?: string[]; pattern?: string; placeholder?: string; hint?: string };
export type ReqDoc = { type: string; label: I18nName; required: boolean };
export type Requirements = { fields: ReqField[]; docs: ReqDoc[] };
export type Worker = {
  id: string; status: "draft" | "pending" | "needs_info" | "approved" | "rejected" | "blocked"; primary_node: string | null; display_name: string | null;
  years_experience: number | null; about: string | null; reg_data: Record<string, string>; is_online: boolean; review_note: string | null; submitted_at: string | null; locked_category: string | null;
};
export type Kyc = { aadhaar_verified: boolean; masked: string; status: string } | null;

export function useMyWorker() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-worker", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_worker"); if (error) throw error; return ((data as unknown as Worker[])?.[0] ?? null);
  } });
}
export function useMyKyc(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-kyc", user?.id], enabled: !!user && enabled, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_kyc"); if (error) throw error; return data as unknown as Kyc;
  } });
}
export function useMyDocs(workerId?: string) {
  return useQuery({ queryKey: ["my-docs", workerId], enabled: !!workerId, queryFn: async () => {
    const { data, error } = await supabase.from("worker_documents").select("doc_type,path,mime").eq("worker_id", workerId!); if (error) throw error; return data;
  } });
}
export function useRequirements(node?: string | null) {
  return useQuery({ queryKey: ["requirements", node], enabled: !!node, staleTime: 5 * 60_000, queryFn: async () => {
    const { data, error } = await supabase.rpc("node_requirements_for", { _slug: node! }); if (error) throw error; return data as unknown as Requirements;
  } });
}
export function useKycMode() {
  return useQuery({ queryKey: ["kyc-mode"], staleTime: Infinity, queryFn: async () => (await supabase.rpc("kyc_mode")).data as string });
}

/** Pluggable Aadhaar OTP provider. `stub` = local DB RPCs with a test OTP; production swaps in the Edge Function provider. */
export interface AadhaarProvider { sendOtp(aadhaar: string): Promise<{ masked: string }>; verifyOtp(otp: string): Promise<boolean> }
export const stubAadhaar: AadhaarProvider = {
  async sendOtp(a) { const { data, error } = await supabase.rpc("aadhaar_send_otp", { _aadhaar: a }); if (error) throw error; return data as { masked: string }; },
  async verifyOtp(otp) { const { data, error } = await supabase.rpc("aadhaar_verify_otp", { _otp: otp }); if (error) throw error; return !!(data as { ok: boolean }).ok; },
};
export const edgeAadhaar: AadhaarProvider = {
  async sendOtp(a) { const { data, error } = await supabase.functions.invoke("kyc-aadhaar", { body: { action: "send", aadhaar: a } }); if (error) throw error; return data; },
  async verifyOtp(otp) { const { data, error } = await supabase.functions.invoke("kyc-aadhaar", { body: { action: "verify", otp } }); if (error) throw error; return !!data?.ok; },
};
export const aadhaarProvider = (mode?: string) => (mode === "stub" ? stubAadhaar : edgeAadhaar);

export async function uploadDoc(userId: string, workerId: string, docType: string, file: File) {
  if (file.size > 10 * 1024 * 1024) throw new Error("too_big");
  const ext = (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${userId}/${docType}-${Date.now()}.${ext}`;
  const up = await supabase.storage.from("worker-docs").upload(path, file, { contentType: file.type, upsert: false });
  if (up.error) throw up.error;
  await supabase.from("worker_documents").delete().eq("worker_id", workerId).eq("doc_type", docType);
  const { error } = await supabase.from("worker_documents").insert({ worker_id: workerId, doc_type: docType, path, mime: file.type, size_bytes: file.size });
  if (error) throw error;
}

export type VerifyCheck = { check: string; status: string };
export type VerifyView = {
  worker_status: string; badge_tier: "licence" | "degree" | null; verified_at: string | null;
  case_status: string | null; decision: string | null; sla_due_at: string | null; hard_fail: string | null;
  checks: VerifyCheck[]; can_appeal: boolean;
} | null;

export function useMyVerification(enabled = true) {
  const { user } = useAuth();
  return useQuery({ queryKey: ["my-verification", user?.id], enabled: !!user && enabled, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_verification"); if (error) throw error; return data as unknown as VerifyView;
  } });
}

/** QR payload and the raw selfie stay in the private kyc bucket. The public portrait is a separate consented photo. */
export async function stageQr(userId: string, payload: string) {
  const path = `${userId}/qr-${Date.now()}.txt`;
  const up = await supabase.storage.from("kyc").upload(path, new Blob([payload], { type: "text/plain" }), { contentType: "text/plain", upsert: false });
  if (up.error) throw up.error;
  const { error } = await supabase.rpc("verification_stage_qr", { _path: path });
  if (error) throw error;
}

export async function stageSelfie(userId: string, file: File, didChallenge: boolean) {
  if (file.size > 5 * 1024 * 1024) throw new Error("too_big");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const rawPath = `${userId}/selfie-${Date.now()}.${ext}`;
  const raw = await supabase.storage.from("kyc").upload(rawPath, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (raw.error) throw raw.error;
  const portrait = await uploadAvatar(userId, file);
  const { error } = await supabase.rpc("verification_stage_selfie", { _raw_path: rawPath, _public_url: portrait, _consent: true, _did_challenge: didChallenge });
  if (error) throw error;
}

export type AdminStatus = { role: boolean; mfa_required: boolean; aal: string; ok: boolean; idle_minutes: number };
/** Admin role and whether this session has passed the second factor. `ok` is what the database enforces. */
export function useAdminStatus() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["admin-status", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("admin_status"); if (error) throw error; return data as unknown as AdminStatus;
  } });
}
/** True when the user holds the admin role (menu entry); admin pages still need `useAdminStatus().ok`. */
export function useIsAdmin() {
  const s = useAdminStatus();
  return { ...s, data: s.data ? s.data.role : s.data };
}
