"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";
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
  const { t } = useLanguage();
  const [members, setMembers] = useState<Member[]>([]);
  const [matrix, setMatrix] = useState<SkillMatrix>({ skills: [], levels: [] });
  const [email, setEmail] = useState("");
  const [skill, setSkill] = useState("");
  const [error, setError] = useState("");
  const role = members.find((m) => m.user_id === actorId)?.role;
  const manager = role === "OWNER" || role === "ADMIN";

  async function load() {
    try {
      const [m, s] = await Promise.all([
        api.get<Member[]>(`/workspaces/${workspace.id}/members`),
        api.get<SkillMatrix>(`/workspaces/${workspace.id}/skills`),
      ]);
      setMembers(m);
      setMatrix(s);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [workspace.id]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/workspaces/${workspace.id}/members`, {
        email,
        role: "MEMBER",
      });
      setEmail("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addSkill(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/workspaces/${workspace.id}/skills`, { name: skill });
      setSkill("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function level(skill_id: number, user_id: number, value: number) {
    try {
      await api.put(`/skills/${skill_id}/members`, { user_id, level: value });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function changeRole(user_id: number, value: string) {
    try {
      await api.patch(`/workspaces/${workspace.id}/members/${user_id}`, {
        role: value,
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
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
    try {
      await api.delete(`/workspaces/${workspace.id}/members/${user_id}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
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
        <div className="error" onClick={() => setError("")}>
          {error}
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
            <button className="button primary">
              {t("Mời tài khoản", "Invite account")}
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
                  onChange={(e) => changeRole(m.user_id, e.target.value)}
                >
                  <option>ADMIN</option>
                  <option>MEMBER</option>
                </select>
              ) : (
                <span className="badge">{m.role}</span>
              )}
              {manager &&
                m.role !== "OWNER" &&
                (role === "OWNER" || m.role === "MEMBER") && (
                  <button
                    className="button danger"
                    onClick={() => remove(m.user_id)}
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
              <h3>{t("Bảng kỹ năng chuyên môn", "Skill proficiency matrix")}</h3>
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
                placeholder={t("Thêm kỹ năng mới", "Add a new skill")}
                value={skill}
                onChange={(e) => setSkill(e.target.value)}
              />
              <button className="button primary">+ {t("Thêm", "Add")}</button>
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
                          disabled={!manager}
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
