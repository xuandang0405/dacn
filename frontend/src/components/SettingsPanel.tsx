"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
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
  const { t } = useLanguage();
  const [role, setRole] = useState("");
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then((rows) =>
        setRole(rows.find((m) => m.user_id === user.id)?.role || ""),
      );
  }, [workspace.id, user.id]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const updated = await api.put<Workspace>(`/workspaces/${workspace.id}`, {
        name,
        description,
      });
      onWorkspaceChange(updated);
      setMessage(t("Đã lưu workspace.", "Workspace saved."));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await api.post("/auth/change-password", {
        old_password: oldPassword,
        new_password: newPassword,
      });
      setOldPassword("");
      setNewPassword("");
      setMessage(
        t(
          "Đã đổi mật khẩu và thu hồi các phiên đăng nhập khác.",
          "Password changed and other sessions revoked.",
        ),
      );
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (
      !confirm(
        t(
          "Xóa vĩnh viễn workspace và mọi dự án bên trong?",
          "Permanently delete this workspace and all its projects?",
        ),
      )
    )
      return;
    try {
      await api.delete(`/workspaces/${workspace.id}`);
      onWorkspaceDelete();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <div className="section-intro">
        <h2>{t("CÀI ĐẶT HỆ THỐNG", "SETTINGS")}</h2>
        <p>
          {t(
            "Quản lý không gian làm việc và bảo mật tài khoản.",
            "Manage your workspace and account security.",
          )}
        </p>
      </div>
      {error && <div className="error">{error}</div>}
      {message && <div className="success">{message}</div>}
      {(role === "OWNER" || role === "ADMIN") && (
        <form className="panel settings-form" onSubmit={save}>
          <h3>{t("THÔNG TIN WORKSPACE", "WORKSPACE PROFILE")}</h3>
          <label>
            {t("Tên workspace", "Workspace name")}
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            {t("Mô tả", "Description")}
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <button className="button primary">
            {t("Lưu thay đổi", "Save changes")}
          </button>
          {role === "OWNER" && (
            <button
              type="button"
              className="button danger settings-delete"
              onClick={remove}
            >
              {t("Xóa workspace", "Delete workspace")}
            </button>
          )}
        </form>
      )}
      <form className="panel settings-form" onSubmit={changePassword}>
        <h3>{t("BẢO MẬT & MẬT KHẨU", "SECURITY & PASSWORD")}</h3>
        <label>
          {t("Mật khẩu hiện tại", "Current password")}
          <input
            required
            type="password"
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
          />
        </label>
        <label>
          {t("Mật khẩu mới", "New password")}
          <input
            required
            type="password"
            minLength={10}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
        </label>
        <button className="button primary">
          {t("Cập nhật mật khẩu", "Update password")}
        </button>
      </form>
    </>
  );
}
