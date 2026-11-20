"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";

type Invitation = {
  id: number;
  workspace: string;
  role: string;
  token: string;
};

export default function InvitationInbox({
  onAccepted,
  refreshKey,
}: {
  onAccepted: () => void;
  refreshKey: number;
}) {
  const { t, message: messageText } = useLanguage();
  const [danhSachLoiMoi, datDanhSachLoiMoi] = useState<Invitation[]>([]);
  const [loi, datLoi] = useState("");
  const [dangXuLy, datDangXuLy] = useState<number | null>(null);
  const taiLoiMoi = useCallback(async () => {
    try {
      datDanhSachLoiMoi(await api.get<Invitation[]>("/invitations"));
    } catch (loi) {
      datLoi((loi as Error).message);
    }
  }, []);
  useEffect(() => {
    taiLoiMoi();
  }, [refreshKey, taiLoiMoi]);
  async function traLoiMoi(row: Invitation, accept: boolean) {
    datDangXuLy(row.id);
    datLoi("");
    try {
      await api.post("/invitations/respond", { token: row.token, accept });
      await taiLoiMoi();
      if (accept) onAccepted();
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangXuLy(null);
    }
  }
  if (!danhSachLoiMoi.length && !loi) return null;
  return (
    <section
      className="panel"
      aria-label={t("Lời mời tham gia", "Workspace invitations")}
    >
      <h2>{t("Lời mời tham gia", "Workspace invitations")}</h2>
      {loi && <p className="error">{messageText(loi)}</p>}
      {danhSachLoiMoi.map((row) => (
        <div className="inline-form" key={row.id}>
          <span>
            <strong>{row.workspace}</strong> · {row.role}
          </span>
          <button
            type="button"
            className="button"
            disabled={dangXuLy !== null}
            onClick={() => traLoiMoi(row, true)}
          >
            {t("Chấp nhận", "Accept")}
          </button>
          <button
            type="button"
            className="button subtle"
            disabled={dangXuLy !== null}
            onClick={() => traLoiMoi(row, false)}
          >
            {t("Từ chối", "Decline")}
          </button>
        </div>
      ))}
    </section>
  );
}
