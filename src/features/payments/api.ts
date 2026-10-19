import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type I18n = { en: string; ta?: string };
export type Pack = { id: string; name_i18n: I18n; price_inr: number; credits: number; bonus: number; sort: number; active: boolean; popular: boolean };
export type Order = { id: string; pack_id: string; amount_paise: number; gst_paise: number; credits: number; bonus: number; provider: string; status: "created" | "paid" | "failed" | "cancelled" | "refunded"; failure_reason: string | null; created_at: string };
export type LedgerRow = { id: string; type: string; amount: number; description: string | null; reference_id: string | null; created_at: string };
export type PayConfig = { gst_pct: number; payout_min: number; payout_hold_hours: number; commission_pct: number; commission_new_pct: number; commission_new_days: number; commission_new_sessions: number };
/** what payments-create-order returns (shape mirrors Razorpay Checkout options) */
export type CheckoutOrder = { order_id: string; provider: "razorpay" | "mock"; key_id: string; provider_order_id: string; amount: number; currency: string; credits: number; bonus: number; email: string | null; phone: string | null };

export const inr = (n: number, frac = 0) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: frac, maximumFractionDigits: frac }).format(n);
export const gstPart = (price: number, pct: number) => Math.round((price * pct / (100 + pct)) * 100) / 100;

export function usePacks(all = false) {
  return useQuery({ queryKey: ["packs", all], queryFn: async () => {
    let q = supabase.from("credit_packs").select("*").order("sort");
    if (!all) q = q.eq("active", true);
    const { data, error } = await q; if (error) throw error; return data as unknown as Pack[];
  } });
}
export function usePayConfig() {
  return useQuery({ queryKey: ["pay-config"], staleTime: 600_000, queryFn: async () => { const { data, error } = await supabase.rpc("payments_config"); if (error) throw error; return data as unknown as PayConfig; } });
}
export function useLedger() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["ledger", user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc("my_wallet_ledger", { _limit: 100 }); if (error) throw error; return data as unknown as LedgerRow[]; } });
}
export function useOrders() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["orders", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.from("payment_orders").select("id,pack_id,amount_paise,gst_paise,credits,bonus,provider,status,failure_reason,created_at").order("created_at", { ascending: false }).limit(20);
    if (error) throw error; return data as unknown as Order[];
  } });
}

async function fnErr(error: unknown): Promise<string> {
  const ctx = (error as { context?: Response })?.context;
  if (ctx && typeof ctx.json === "function") { try { const b = await ctx.json(); return b.error ?? String(error); } catch { /* not json */ } }
  return (error as Error)?.message ?? String(error);
}
export async function createOrder(packId: string): Promise<CheckoutOrder> {
  const { data, error } = await supabase.functions.invoke("payments-create-order", { body: { pack_id: packId } });
  if (error) throw new Error(await fnErr(error));
  return data as CheckoutOrder;
}
export type CheckoutSuccess = { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string };
export async function verifyPayment(p: CheckoutSuccess): Promise<{ status: string; credited: boolean; balance?: number }> {
  const { data, error } = await supabase.functions.invoke("payments-verify", { body: p });
  if (error) throw new Error(await fnErr(error));
  return data;
}
export async function mockGateway(providerOrderId: string, outcome: "success" | "failure"): Promise<CheckoutSuccess | { error: { code: string; description: string } }> {
  const { data, error } = await supabase.functions.invoke("payments-mock", { body: { provider_order_id: providerOrderId, outcome } });
  if (error) throw new Error(await fnErr(error));
  return data;
}
export async function cancelOrder(orderId: string) { await supabase.rpc("payment_order_cancel", { _id: orderId }); }

export type BonusInfo = { total: number; next_amount: number | null; next_expires_at: string | null; expiry_days: number };
export function useBonus() {
  const { user } = useAuth();
  return useQuery({ queryKey: ["wallet", "bonus", user?.id], enabled: !!user, queryFn: async () => { const { data, error } = await supabase.rpc("my_bonus"); if (error) throw error; return data as unknown as BonusInfo | null; } });
}
