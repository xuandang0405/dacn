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
  const [danhSachThongBao, datDanhSachThongBao] = useState<Notification[]>([]);
  const [loi, datLoi] = useState("");
  const [soChuaDoc, datSoChuaDoc] = useState(0);
  const [dangTai, datDangTai] = useState(true);
  const [dangXuLy, datDangXuLy] = useState(false);
  const taiThongBao = useCallback(async () => {
    try {
      const [thongBaoMoi, tongChuaDoc] = await Promise.all([
        api.get<Notification[]>("/notifications"),
        api.get<{ count: number }>("/notifications/unread-count"),
      ]);
      datDanhSachThongBao(thongBaoMoi);
      datSoChuaDoc(tongChuaDoc.count);
      onUnreadChange(tongChuaDoc.count);
      datLoi("");
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangTai(false);
    }
  }, [onUnreadChange]);
  useEffect(() => {
    taiThongBao();
  }, [refreshKey, taiThongBao]);
  async function danhDauDaDoc(id: number) {
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.post(`/notifications/${id}/read`);
      await taiThongBao();
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function docTatCa() {
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.post("/notifications/read-all");
      await taiThongBao();
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  // Nội dung phụ thuộc loại thông báo; tách khỏi JSX để dễ đọc và sửa bản dịch.
  function noiDungThongBao(thongBao: Notification) {
    if (language === "en") return thongBao.message;

    switch (thongBao.kind) {
      case "task_assigned":
        return thongBao.message.replace(/^Assigned: /, "Được giao: ");
      case "mention":
        return thongBao.message.replace(/ mentioned you$/, " đã nhắc đến bạn");
      case "role_changed":
        return thongBao.message.replace(
          /^Your role is now (.+)$/,
          (_, vaiTro: string) =>
            `Vai trò mới của bạn: ${enumLabel(vaiTro, language)}`,
        );
      case "task_overdue":
        return thongBao.message.replace(
          /^Task overdue: /,
          "Công việc quá hạn: ",
        );
      case "deadline_soon":
        return thongBao.message.replace(
          /^Deadline approaching: /,
          "Sắp đến hạn: ",
        );
      case "invitation":
        return t(
          "Bạn có lời mời tham gia workspace đang chờ phản hồi.",
          thongBao.message,
        );
      default:
        return thongBao.message;
    }
  }
  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t("Thông báo của bạn", "Your notifications")}</h2>
          <p className="muted">
            {soChuaDoc} {t("chưa đọc", "unread")}
          </p>
        </div>
        <button
          type="button"
          className="button subtle"
          onClick={docTatCa}
          disabled={dangXuLy || dangTai || soChuaDoc === 0}
        >
          {t("Đánh dấu tất cả đã đọc", "Mark all as read")}
        </button>
      </div>
      {loi && <div className="error">{messageText(loi)}</div>}
      {dangTai && (
        <p className="muted" role="status">
          {t("Đang tải thông báo…", "Loading notifications…")}
        </p>
      )}
      <div className="notification-list">
        {danhSachThongBao.map((thongBao) => (
          <button
            type="button"
            key={thongBao.id}
            className={thongBao.read ? "" : "unread"}
            disabled={dangXuLy}
            onClick={() => danhDauDaDoc(thongBao.id)}
          >
            <span className="activity-dot" />
            <span>
              <strong>{noiDungThongBao(thongBao)}</strong>
              <small>
                {enumLabel(thongBao.kind, language)} ·{" "}
                {formatTimestamp(thongBao.created_at, language)}
              </small>
            </span>
          </button>
        ))}
        {!dangTai && !loi && !danhSachThongBao.length && (
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
