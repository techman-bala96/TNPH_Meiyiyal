import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
/** The generated DB types predate M9 (notifications, push_subscriptions, push_* RPCs), so push code uses an untyped view of the same client. */
export const db = supabase as unknown as SupabaseClient;
