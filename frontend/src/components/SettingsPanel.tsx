"use client";
import { useEffect, useState } from "react";
import { api, endSession } from "@/lib/api";
import { useLanguage } from "@/lib/language";
import type { Member, User, Workspace } from "@/lib/types";

export default function SettingsPanel({
  workspace,
  user,
  onWorkspaceChange,
  onWorkspaceDelete,
}: {
  workspace: Workspace;
  user: User;
  onWorkspaceChange: (w: Workspace) => void;
  onWorkspaceDelete: () => void;
}) {
  const { t, message: messageText } = useLanguage();
  const [role, setRole] = useState("");
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [thongBao, datThongBao] = useState("");
  const [loi, datLoi] = useState("");
  const [dangLuu, datDangLuu] = useState(false);
  const [dangDoiMatKhau, datDangDoiMatKhau] = useState(false);
  const [dangXoa, datDangXoa] = useState(false);
  useEffect(() => {
    let active = true;
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then(
        (rows) =>
          active &&
          setRole(rows.find((m) => m.user_id === user.id)?.role || ""),
      )
      .catch((loi) => {
        if (active) datLoi(loi.message);
      });
    return () => {
      active = false;
    };
  }, [workspace.id, user.id]);
  async function luuNhom(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangLuu) return;
    datLoi("");
    datThongBao("");
    datDangLuu(true);
    try {
      const updated = await api.put<Workspace>(`/workspaces/${workspace.id}`, {
        name,
        description,
      });
      onWorkspaceChange(updated);
      datThongBao("Workspace saved.");
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangLuu(false);
    }
  }
  async function doiMatKhau(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangDoiMatKhau) return;
    datLoi("");
    datThongBao("");
    datDangDoiMatKhau(true);
    try {
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword("");
      setNewPassword("");
      endSession("password_changed");
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangDoiMatKhau(false);
    }
  }
  async function xoaNhom() {
    if (dangXoa) return;
    if (
      !confirm(
        t(
          "Xóa vĩnh viễn workspace và mọi dự án bên trong?",
          "Permanently delete this workspace and all its projects?",
        ),
      )
    )
      return;
    datLoi("");
    datThongBao("");
    datDangXoa(true);
    try {
      await api.delete(`/workspaces/${workspace.id}`);
      onWorkspaceDelete();
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangXoa(false);
    }
  }
  return (
    <>
      <div className="section-intro">
        <h2>
          {t("Cài đặt nhóm và tài khoản", "Workspace and account settings")}
        </h2>
        <p>
          {t(
            "Quản lý không gian làm việc và bảo mật tài khoản.",
            "Manage your workspace and account security.",
          )}
        </p>
      </div>
      {loi && <div className="error">{messageText(loi)}</div>}
      {thongBao && <div className="success">{messageText(thongBao)}</div>}
      {(role === "OWNER" || role === "ADMIN") && (
        <form className="panel settings-form" onSubmit={luuNhom}>
          <h3>{t("Thông tin workspace", "Workspace profile")}</h3>
          <label>
            {t("Tên workspace", "Workspace name")}
            <input
              required
              maxLength={160}
              value={name}
              onChange={(suKien) => setName(suKien.target.value)}
            />
          </label>
          <label>
            {t("Mô tả", "Description")}
            <textarea
              rows={3}
              value={description}
              onChange={(suKien) => setDescription(suKien.target.value)}
            />
          </label>
          <button
            type="submit"
            className="button primary"
            disabled={dangLuu || dangXoa}
          >
            {dangLuu
              ? t("Đang lưu…", "Saving…")
              : t("Lưu thay đổi", "Save changes")}
          </button>
          {role === "OWNER" && (
            <button
              type="button"
              className="button danger settings-delete"
              onClick={xoaNhom}
              disabled={dangLuu || dangXoa}
            >
              {t("Xóa workspace", "Delete workspace")}
            </button>
          )}
        </form>
      )}
      <form className="panel settings-form" onSubmit={doiMatKhau}>
        <h3>{t("Bảo mật và mật khẩu", "Security and password")}</h3>
        <label>
          {t("Mật khẩu hiện tại", "Current password")}
          <input
            required
            type="password"
            value={oldPassword}
            onChange={(suKien) => setOldPassword(suKien.target.value)}
          />
        </label>
        <label>
          {t("Mật khẩu mới", "New password")}
          <input
            required
            type="password"
            minLength={10}
            maxLength={128}
            value={newPassword}
            onChange={(suKien) => setNewPassword(suKien.target.value)}
          />
        </label>
        <button
          type="submit"
          className="button primary"
          disabled={dangDoiMatKhau}
        >
          {dangDoiMatKhau
            ? t("Đang cập nhật…", "Updating…")
            : t("Cập nhật mật khẩu", "Update password")}
        </button>
      </form>
    </>
  );
}
