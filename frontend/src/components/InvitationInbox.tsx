"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";

type Invitation = { id: number; workspace: string; role: string; token: string };

export default function InvitationInbox({ onAccepted, refreshKey }: { onAccepted: () => void; refreshKey: number }) {
  const { t } = useLanguage();
  const [rows, setRows] = useState<Invitation[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  async function load() {
    try { setRows(await api.get<Invitation[]>("/invitations")); }
    catch (e) { setError((e as Error).message); }
  }
  useEffect(() => { load(); }, [refreshKey]);
  async function respond(row: Invitation, accept: boolean) {
    setBusy(row.id); setError("");
    try {
      await api.post("/invitations/respond", { token: row.token, accept });
      await load();
      if (accept) onAccepted();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(null); }
  }
  if (!rows.length && !error) return null;
  return <section className="panel" aria-label={t("Lời mời tham gia", "Workspace invitations")}>
    <h2>{t("Lời mời tham gia", "Workspace invitations")}</h2>
    {error && <p className="error">{error}</p>}
    {rows.map(row => <div className="inline-form" key={row.id}>
      <span><strong>{row.workspace}</strong> · {row.role}</span>
      <button className="button" disabled={busy !== null} onClick={() => respond(row, true)}>{t("Chấp nhận", "Accept")}</button>
      <button className="button subtle" disabled={busy !== null} onClick={() => respond(row, false)}>{t("Từ chối", "Decline")}</button>
    </div>)}
  </section>;
}
