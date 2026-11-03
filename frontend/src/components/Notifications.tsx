"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import { formatTimestamp } from "@/lib/dates";
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
  const { language, t, message: messageText } = useLanguage();
  const [rows, setRows] = useState<Notification[]>([]);
  const [error, setError] = useState("");
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const [next, total] = await Promise.all([
        api.get<Notification[]>("/notifications"),
        api.get<{ count: number }>("/notifications/unread-count"),
      ]);
      setRows(next);
      setUnread(total.count);
      onUnreadChange(total.count);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [onUnreadChange]);
  useEffect(() => {
    load();
  }, [refreshKey, load]);
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
            {unread} {t("chưa đọc", "unread")}
          </p>
        </div>
        <button type="button" className="button subtle" onClick={all}>
          {t("Đánh dấu tất cả đã đọc", "Mark all as read")}
        </button>
      </div>
      {error && <div className="error">{messageText(error)}</div>}
      <div className="notification-list">
        {rows.map((n) => (
          <button
            type="button"
            key={n.id}
            className={n.read ? "" : "unread"}
            onClick={() => mark(n.id)}
          >
            <span className="activity-dot" />
            <span>
              <strong>
                {language === "en"
                  ? n.message
                  : n.kind === "task_assigned"
                    ? n.message.replace(/^Assigned: /, "Được giao: ")
                    : n.kind === "mention"
                      ? n.message.replace(/ mentioned you$/, " đã nhắc đến bạn")
                      : n.kind === "role_changed"
                        ? n.message.replace(
                            /^Your role is now (.+)$/,
                            (_, role: string) =>
                              `Vai trò mới của bạn: ${enumLabel(role, language)}`,
                          )
                        : n.kind === "task_overdue"
                          ? n.message.replace(
                              /^Task overdue: /,
                              "Công việc quá hạn: ",
                            )
                          : n.kind === "deadline_soon"
                            ? n.message.replace(
                                /^Deadline approaching: /,
                                "Sắp đến hạn: ",
                              )
                            : n.kind === "invitation"
                              ? t(
                                  "Bạn có lời mời tham gia workspace đang chờ phản hồi.",
                                  n.message,
                                )
                              : n.message}
              </strong>
              <small>
                {enumLabel(n.kind, language)} ·{" "}
                {formatTimestamp(n.created_at, language)}
              </small>
            </span>
          </button>
        ))}
        {!rows.length && (
          <p
            className="muted"
            style={{ padding: "28px 0", textAlign: "center" }}
          >
            {t("Chưa có thông báo nào.", "No notifications yet.")}
          </p>
        )}
      </div>
    </div>
  );
}
