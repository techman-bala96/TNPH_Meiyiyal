import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ChevronRight, Coins, Loader2, MapPin, Plus } from "lucide-react";
import { useWallet } from "@/features/consult/api";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageShell, Section } from "@/components/app/PageShell";
import { WorkerBadge } from "@/components/app/WorkerBadge";
import { UserAvatar } from "@/components/app/UserMenu";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { uploadAvatar, useProfile, useUpdateProfile } from "@/features/profile/useProfile";

type Saved = { id: string; district_name: { en: string; ta?: string } | null; area_name: string | null; area_name_ta: string | null; address: string | null; is_current: boolean };

export default function Profile() {
  const { t, i18n } = useTranslation(); const ta = i18n.language?.startsWith("ta");
  const { user } = useAuth(); const { data: p } = useProfile(); const update = useUpdateProfile(); const qc = useQueryClient();
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [dob, setDob] = useState("");
  const [busy, setBusy] = useState<"save" | "photo" | null>(null); const [err, setErr] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p) { setName(p.full_name ?? ""); setPhone(p.phone_number?.replace(/^\+91/, "") ?? ""); setDob(p.dob ?? ""); } }, [p]);

  const locs = useQuery({ queryKey: ["my-locations", user?.id], enabled: !!user, queryFn: async () => {
    const { data, error } = await supabase.rpc("my_locations"); if (error) throw error; return data as unknown as Saved[];
  } });

  async function save() {
    setErr(null);
    const digits = phone.replace(/\D/g, "");
    if (digits && digits.length !== 10) return setErr(t("auth.invalidPhone"));
    if (name.trim().length > 80) return setErr(t("profile.nameTooLong"));
    setBusy("save");
    try { await update({ full_name: name.trim() || null, phone_number: digits ? `+91${digits}` : null, dob: dob || null }); toast.success(t("profile.saved")); }
    catch { setErr(t("common.error")); } finally { setBusy(null); }
  }
  async function onPhoto(f?: File) {
    if (!f || !user) return;
    if (!/^image\//.test(f.type)) return setErr(t("profile.photoType"));
    setBusy("photo"); setErr(null);
    try { const url = await uploadAvatar(user.id, f); await update({ avatar_url: url }); }
    catch { setErr(t("profile.photoError")); } finally { setBusy(null); if (file.current) file.current.value = ""; }
  }
  async function switchLoc(id: string) {
    await supabase.rpc("use_saved_location", { _id: id });
    await Promise.all([qc.invalidateQueries({ queryKey: ["my-locations"] }), qc.invalidateQueries({ queryKey: ["current-location"] })]);
  }
  const label = (l: Saved) => [(ta && l.area_name_ta) || l.area_name, l.district_name ? (ta && l.district_name.ta) || l.district_name.en : null].filter((v, i, a) => v && a.indexOf(v) === i).join(", ");

  const { data: wallet } = useWallet();
  return (
    <PageShell title={t("menu.profile")} testId="profile-page">
      <Link to="/wallet" data-testid="profile-wallet" className="flex items-center gap-3 rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-600 p-4 text-white shadow-md transition hover:-translate-y-0.5">
        <span className="grid h-11 w-11 place-items-center rounded-full bg-white/15"><Coins className="h-5 w-5" /></span>
        <span className="flex-1"><span className="block text-xs opacity-85">{t("wallet.title")}</span><b className="text-lg tabular-nums">{wallet ? Number(wallet.balance).toFixed(0) : "—"} {t("wallet.credits")}</b></span>
        <span className="rounded-full bg-white/20 px-3 py-1 text-xs font-semibold">{t("wallet.topUp")}</span><ChevronRight className="h-4 w-4 opacity-80" />
      </Link>
      <div className="flex flex-col items-center gap-2 pt-2">
        <button data-testid="btn-photo" onClick={() => file.current?.click()} className="relative rounded-full" aria-label={t("profile.changePhoto")}>
          <UserAvatar className="h-24 w-24 text-2xl" />
          <span className="absolute bottom-0 right-0 grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow ring-2 ring-background">
            {busy === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
          </span>
        </button>
        <input ref={file} data-testid="input-photo" type="file" accept="image/*" className="hidden" onChange={(e) => onPhoto(e.target.files?.[0])} />
        <p className="text-xs text-muted-foreground">{t("profile.photoHint")}</p>
      </div>

      <WorkerBadge />
      <Section title={t("profile.details")}>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="pf-name">{t("profile.name")}</Label>
            <Input id="pf-name" data-testid="input-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder={t("profile.namePh")} className="h-11 rounded-xl" /></div>
          <div className="space-y-1"><Label htmlFor="pf-email">{t("auth.emailLabel")}</Label>
            <Input id="pf-email" data-testid="input-email-ro" value={user?.email ?? "—"} readOnly disabled className="h-11 rounded-xl" /></div>
          <div className="space-y-1"><Label htmlFor="pf-phone">{t("auth.phoneLabel")}</Label>
            <div className="flex h-11 items-center rounded-xl border bg-background pl-3 focus-within:ring-2 focus-within:ring-ring">
              <span className="text-sm text-muted-foreground">+91</span>
              <input id="pf-phone" data-testid="input-phone-profile" inputMode="numeric" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, "").slice(0, 10))}
                placeholder="98765 43210" className="h-full flex-1 bg-transparent px-2 text-sm outline-none" /></div></div>
          <div className="space-y-1"><Label htmlFor="pf-dob">{t("profile.dob")}</Label>
            <Input id="pf-dob" data-testid="input-dob" type="date" value={dob} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDob(e.target.value)} className="h-11 rounded-xl" /></div>
          {err && <p data-testid="profile-error" role="alert" className="text-sm text-destructive">{err}</p>}
          <Button data-testid="btn-save-profile" onClick={save} disabled={!!busy} className="tap w-full rounded-xl">
            {busy === "save" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}{t("profile.save")}</Button>
        </div>
      </Section>

      <Section title={t("profile.locations")}>
        <ul className="divide-y" data-testid="saved-locations">
          {(locs.data ?? []).map((l) => (
            <li key={l.id} className="flex min-h-12 items-center gap-3 py-2">
              <MapPin className={`h-4 w-4 shrink-0 ${l.is_current ? "text-primary" : "text-muted-foreground"}`} />
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label(l)}</span>
                {l.address && <span className="block truncate text-xs text-muted-foreground">{l.address}</span>}</span>
              {l.is_current ? <span data-testid="loc-current" className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">{t("profile.current")}</span>
                : <button data-testid="loc-use" onClick={() => switchLoc(l.id)} className="text-xs font-semibold text-primary">{t("profile.use")}</button>}
            </li>
          ))}
        </ul>
        <Link to="/location" state={{ from: "/profile" }} data-testid="add-location" className="tap mt-1 flex items-center gap-2 text-sm font-semibold text-primary"><Plus className="h-4 w-4" />{t("profile.addLocation")}</Link>
      </Section>
    </PageShell>
  );
}
