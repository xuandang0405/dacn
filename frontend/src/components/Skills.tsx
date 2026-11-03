"use client";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import type { Member, SkillMatrix, Workspace } from "@/lib/types";

export default function Skills({
  workspace,
  actorId,
  membersOnly = false,
}: {
  workspace: Workspace;
  actorId: number;
  membersOnly?: boolean;
}) {
  const { language, t, message: messageText } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<SkillMatrix>({ skills: [], levels: [] });
  const [email, setEmail] = useState("");
  const [skill, setSkill] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const role = members.find((m) => m.user_id === actorId)?.role;
  const manager = role === "OWNER" || role === "ADMIN";

  const load = useCallback(async () => {
    try {
      const [m, s] = await Promise.all([
        api.get<Member[]>(`/workspaces/${workspace.id}/members`),
        api.get<SkillMatrix>(`/workspaces/${workspace.id}/skills`),
      ]);
      setMembers(m);
      setMatrix(s);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [workspace.id]);
  useEffect(() => {
    load();
  }, [load]);

  async function mutate(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    await mutate(async () => {
      await api.post(`/workspaces/${workspace.id}/members`, {
        email,
        role: "MEMBER",
      });
      setEmail("");
      setMessage("Invitation sent. Waiting for acceptance.");
    });
  }
  async function addSkill(e: React.FormEvent) {
    e.preventDefault();
    await mutate(async () => {
      await api.post(`/workspaces/${workspace.id}/skills`, { name: skill });
      setSkill("");
    });
  }
  async function level(skill_id: number, user_id: number, value: number) {
    await mutate(async () => {
      await api.put(`/skills/${skill_id}/members`, { user_id, level: value });
    });
  }
  async function changeRole(user_id: number, value: string) {
    await mutate(async () => {
      await api.patch(`/workspaces/${workspace.id}/members/${user_id}`, {
        role: value,
      });
    });
  }
  async function remove(user_id: number) {
    if (
      !confirm(
        t(
          "Xóa thành viên khỏi workspace?",
          "Remove this member from the workspace?",
        ),
      )
    )
      return;
    await mutate(async () => {
      await api.delete(`/workspaces/${workspace.id}/members/${user_id}`);
    });
  }

  return (
    <>
      <div className="section-intro">
        <h2>
          {membersOnly
            ? t("THÀNH VIÊN", "MEMBERS")
            : t("MA TRẬN KỸ NĂNG", "SKILL MATRIX")}
        </h2>
        <p>
          {membersOnly
            ? t(
                "Quản lý danh sách thành viên và phân quyền trong workspace.",
                "Manage workspace members and permissions.",
              )
            : t(
                "Theo dõi kỹ năng thực tế để phân công công việc hiệu quả.",
                "Track member skills to assign work effectively.",
              )}
        </p>
      </div>
      {error && (
        <div className="error" role="alert">
          {messageText(error)}
          <button
            type="button"
            onClick={() => setError("")}
            aria-label={t("Đóng thông báo", "Dismiss message")}
          >
            ×
          </button>
        </div>
      )}
      {message && (
        <div className="success" role="status">
          {messageText(message)}
        </div>
      )}
      <div className="panel">
        <div className="panel-header">
          <h3>
            {membersOnly
              ? t("Danh sách thành viên", "Member roster")
              : t("Thành viên workspace", "Workspace members")}
          </h3>
        </div>
        {manager && (
          <form className="inline-form" onSubmit={invite}>
            <input
              type="email"
              required
              placeholder="email@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button type="submit" className="button primary" disabled={busy}>
              {busy
                ? t("Đang xử lý…", "Working…")
                : t("Mời tài khoản", "Invite account")}
            </button>
          </form>
        )}
        <div className="member-list">
          {members.map((m) => (
            <div key={m.user_id}>
              <span className="avatar small">{m.name[0]}</span>
              <span>
                <strong>{m.name}</strong>
                <small>
                  @{m.username} · {m.email}
                </small>
              </span>
              {role === "OWNER" && m.role !== "OWNER" ? (
                <select
                  aria-label={`${t("Vai trò", "Role")} ${m.name}`}
                  value={m.role}
                  disabled={busy}
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                >
                  <option value="ADMIN">{enumLabel("ADMIN", language)}</option>
                  <option value="MEMBER">
                    {enumLabel("MEMBER", language)}
                  </option>
                </select>
              ) : (
                <span className="badge">{enumLabel(m.role, language)}</span>
              )}
              {manager &&
                m.role !== "OWNER" &&
                (role === "OWNER" || m.role === "MEMBER") && (
                  <button
                    type="button"
                    className="button danger"
                    onClick={() => remove(m.user_id)}
                    disabled={busy}
                  >
                    {t("Xóa", "Remove")}
                  </button>
                )}
            </div>
          ))}
        </div>
      </div>
      {!membersOnly && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>
                {t("Bảng kỹ năng chuyên môn", "Skill proficiency matrix")}
              </h3>
              <p className="muted">
                {t(
                  "Đánh giá mức độ từ 1–5. Chỉ Quản trị viên có quyền cập nhật.",
                  "Proficiency rated 1–5. Managed by administrators.",
                )}
              </p>
            </div>
          </div>
          {manager && (
            <form className="inline-form" onSubmit={addSkill}>
              <input
                required
                maxLength={100}
                placeholder={t("Thêm kỹ năng mới", "Add a new skill")}
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              />
              <button type="submit" className="button primary" disabled={busy}>
                + {t("Thêm", "Add")}
              </button>
            </form>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Thành viên", "Member")}</th>
                  {matrix.skills.map((s) => (
                    <th key={s.id}>{s.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.user_id}>
                    <td>{m.name}</td>
                    {matrix.skills.map((s) => (
                      <td key={s.id}>
                        <select
                          disabled={!manager || busy}
                          aria-label={`${s.name} - ${m.name}`}
                          value={
                            matrix.levels.find(
                              (x) =>
                                x.skill_id === s.id && x.user_id === m.user_id,
                            )?.level || 0
                          }
                          onChange={(e) =>
                            level(s.id, m.user_id, Number(e.target.value))
                          }
                        >
                          <option value={0}>—</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {"■".repeat(n) + "□".repeat(5 - n)} LVL {n}/5
                            </option>
                          ))}
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
