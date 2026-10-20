"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";
type Notification = {
  id: number;
  kind: string;
  message: string;
  entity_id: number | null;
  read: boolean;
  created_at: string;
};
export default function Notifications({
  onUnreadChange,
  refreshKey,
}: {
  onUnreadChange: (count: number) => void;
  refreshKey: number;
}) {
  const { language, t } = useLanguage();
  const [rows, setRows] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  async function load() {
    try {
      const next = await api.get<Notification[]>("/notifications");
      setRows(next);
      onUnreadChange(next.filter((n) => !n.read).length);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [refreshKey]);
  async function mark(id: number) {
    try {
      await api.post(`/notifications/${id}/read`);
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function all() {
    try {
      await api.post("/notifications/read-all");
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t("THÔNG BÁO HỆ THỐNG", "NOTIFICATIONS")}</h2>
          <p className="muted">
            {rows.filter((x) => !x.read).length} {t("chưa đọc", "unread")}
          </p>
        </div>
        <button className="button subtle" onClick={all}>
          {t("Đánh dấu tất cả đã đọc", "Mark all as read")}
        </button>
      </div>
      {error && <div className="error">{error}</div>}
      <div className="notification-list">
        {rows.map((n) => (
          <button
            key={n.id}
            className={n.read ? "" : "unread"}
            onClick={() => mark(n.id)}
          >
            <span className="activity-dot" />
            <span>
              <strong>{n.message}</strong>
              <small>
                {n.kind.toUpperCase()} ·{" "}
                {new Date(n.created_at).toLocaleString(
                  language === "vi" ? "vi-VN" : "en-US",
                )}
              </small>
            </span>
          </button>
        ))}
        {!rows.length && (
          <p className="muted" style={{ padding: "28px 0", textAlign: "center" }}>
            {t("Chưa có thông báo nào.", "No notifications yet.")}
          </p>
        )}
      </div>
    </div>
  );
}
