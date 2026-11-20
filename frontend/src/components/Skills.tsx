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
  const [loi, datLoi] = useState("");
  const [thongBao, datThongBao] = useState("");
  const [dangXuLy, datDangXuLy] = useState(false);
  const role = members.find((thanhVien) => thanhVien.user_id === actorId)?.role;
  const laQuanLy = role === "OWNER" || role === "ADMIN";

  const taiThanhVienVaKyNang = useCallback(async () => {
    try {
      const [thanhVien, kyNang] = await Promise.all([
        api.get<Member[]>(`/workspaces/${workspace.id}/members`),
        api.get<SkillMatrix>(`/workspaces/${workspace.id}/skills`),
      ]);
      setMembers(thanhVien);
      setMatrix(kyNang);
      datLoi("");
    } catch (loi) {
      datLoi((loi as Error).message);
    }
  }, [workspace.id]);
  useEffect(() => {
    taiThanhVienVaKyNang();
  }, [taiThanhVienVaKyNang]);

  async function thucHienThayDoi(action: () => Promise<void>) {
    if (dangXuLy) return;
    datDangXuLy(true);
    datLoi("");
    datThongBao("");
    try {
      await action();
      await taiThanhVienVaKyNang();
    } catch (loi) {
      datLoi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }

  async function moiThanhVien(suKien: React.FormEvent) {
    suKien.preventDefault();
    await thucHienThayDoi(async () => {
      await api.post(`/workspaces/${workspace.id}/members`, {
        email,
        role: "MEMBER",
      });
      setEmail("");
      datThongBao("Invitation sent. Waiting for acceptance.");
    });
  }
  async function themKyNang(suKien: React.FormEvent) {
    suKien.preventDefault();
    await thucHienThayDoi(async () => {
      await api.post(`/workspaces/${workspace.id}/skills`, { name: skill });
      setSkill("");
    });
  }
  async function doiMucKyNang(
    skill_id: number,
    user_id: number,
    value: number,
  ) {
    await thucHienThayDoi(async () => {
      await api.put(`/skills/${skill_id}/members`, { user_id, level: value });
    });
  }
  async function doiVaiTro(user_id: number, value: string) {
    await thucHienThayDoi(async () => {
      await api.patch(`/workspaces/${workspace.id}/members/${user_id}`, {
        role: value,
      });
    });
  }
  async function doiNangLuc(thanhVien: Member, oNhap: HTMLInputElement) {
    const soGio = Number(oNhap.value);
    if (
      oNhap.value === "" ||
      !oNhap.validity.valid ||
      !Number.isInteger(soGio)
    ) {
      oNhap.value = String(thanhVien.capacity_hours);
      datLoi(
        t(
          "Số giờ mỗi tuần phải là số nguyên từ 0 đến 168.",
          "Weekly hours must be an integer from 0 to 168.",
        ),
      );
      return;
    }
    if (soGio === thanhVien.capacity_hours) return;
    await thucHienThayDoi(async () => {
      await api.patch(
        `/workspaces/${workspace.id}/members/${thanhVien.user_id}/capacity`,
        { capacity_hours: soGio },
      );
    });
    // Nếu request thất bại, không giữ một giá trị chưa lưu trên màn hình.
    if (oNhap.isConnected) oNhap.value = String(thanhVien.capacity_hours);
  }
  async function xoaThanhVien(user_id: number) {
    if (
      !confirm(
        t(
          "Xóa thành viên khỏi workspace?",
          "Remove this member from the workspace?",
        ),
      )
    )
      return;
    await thucHienThayDoi(async () => {
      await api.delete(`/workspaces/${workspace.id}/members/${user_id}`);
    });
  }

  return (
    <>
      <div className="section-intro">
        <h2>
          {membersOnly
            ? t("Thành viên trong nhóm", "Team members")
            : t("Kỹ năng của nhóm", "Team skills")}
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
      {loi && (
        <div className="error" role="alert">
          {messageText(loi)}
          <button
            type="button"
            onClick={() => datLoi("")}
            aria-label={t("Đóng thông báo", "Dismiss message")}
          >
            ×
          </button>
        </div>
      )}
      {thongBao && (
        <div className="success" role="status">
          {messageText(thongBao)}
        </div>
      )}
      {membersOnly && (
        <div className="panel">
          <div className="panel-header">
            <h3>
              {membersOnly
                ? t("Danh sách thành viên", "Member roster")
                : t("Thành viên workspace", "Workspace members")}
            </h3>
          </div>
          {laQuanLy && (
            <form className="inline-form" onSubmit={moiThanhVien}>
              <input
                type="email"
                required
                placeholder="email@company.com"
                value={email}
                onChange={(suKien) => setEmail(suKien.target.value)}
              />
              <button
                type="submit"
                className="button primary"
                disabled={dangXuLy}
              >
                {dangXuLy
                  ? t("Đang xử lý…", "Working…")
                  : t("Mời tài khoản", "Invite account")}
              </button>
            </form>
          )}
          <div className="member-list">
            {members.map((thanhVien) => (
              <div key={thanhVien.user_id}>
                <span className="avatar small">{thanhVien.name[0]}</span>
                <span>
                  <strong>{thanhVien.name}</strong>
                  <small>
                    @{thanhVien.username} · {thanhVien.email}
                  </small>
                </span>
                {laQuanLy ? (
                  <label>
                    {t("Giờ/tuần", "Hours/week")}
                    <input
                      key={`${thanhVien.user_id}:${thanhVien.capacity_hours}`}
                      type="number"
                      min="0"
                      max="168"
                      step="1"
                      style={{ width: 84 }}
                      defaultValue={thanhVien.capacity_hours}
                      disabled={dangXuLy}
                      aria-label={`${t("Năng lực mỗi tuần", "Weekly capacity")} ${thanhVien.name}`}
                      onBlur={(suKien) =>
                        doiNangLuc(thanhVien, suKien.currentTarget)
                      }
                    />
                  </label>
                ) : (
                  <small>
                    {thanhVien.capacity_hours} {t("giờ/tuần", "hours/week")}
                  </small>
                )}
                {role === "OWNER" && thanhVien.role !== "OWNER" ? (
                  <select
                    aria-label={`${t("Vai trò", "Role")} ${thanhVien.name}`}
                    value={thanhVien.role}
                    disabled={dangXuLy}
                    onChange={(suKien) =>
                      doiVaiTro(thanhVien.user_id, suKien.target.value)
                    }
                  >
                    <option value="ADMIN">
                      {enumLabel("ADMIN", language)}
                    </option>
                    <option value="MEMBER">
                      {enumLabel("MEMBER", language)}
                    </option>
                  </select>
                ) : (
                  <span className="badge">
                    {enumLabel(thanhVien.role, language)}
                  </span>
                )}
                {laQuanLy &&
                  thanhVien.role !== "OWNER" &&
                  (role === "OWNER" || thanhVien.role === "MEMBER") && (
                    <button
                      type="button"
                      className="button danger"
                      onClick={() => xoaThanhVien(thanhVien.user_id)}
                      disabled={dangXuLy}
                    >
                      {t("Xóa", "Remove")}
                    </button>
                  )}
              </div>
            ))}
          </div>
        </div>
      )}
      {!membersOnly && (
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>
                {t("Bảng kỹ năng chuyên môn", "Skill proficiency matrix")}
              </h3>
              <p className="muted">
                {t(
                  "Đánh giá từ 1–5. Chủ sở hữu và quản trị viên có thể cập nhật; chọn chưa chấm để bỏ mức đánh giá.",
                  "Rate skills from 1–5. Owners and administrators can update ratings; select Unrated to clear one.",
                )}
              </p>
            </div>
          </div>
          {laQuanLy && (
            <form className="inline-form" onSubmit={themKyNang}>
              <input
                required
                maxLength={100}
                placeholder={t("Thêm kỹ năng mới", "Add a new skill")}
                value={skill}
                onChange={(suKien) => setSkill(suKien.target.value)}
              />
              <button
                type="submit"
                className="button primary"
                disabled={dangXuLy}
              >
                + {t("Thêm", "Add")}
              </button>
            </form>
          )}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>{t("Thành viên", "Member")}</th>
                  {matrix.skills.map((kyNang) => (
                    <th key={kyNang.id}>{kyNang.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {members.map((thanhVien) => (
                  <tr key={thanhVien.user_id}>
                    <td>{thanhVien.name}</td>
                    {matrix.skills.map((kyNang) => (
                      <td key={kyNang.id}>
                        <select
                          disabled={!laQuanLy || dangXuLy}
                          aria-label={`${kyNang.name} - ${thanhVien.name}`}
                          value={
                            matrix.levels.find(
                              (x) =>
                                x.skill_id === kyNang.id &&
                                x.user_id === thanhVien.user_id,
                            )?.level || 0
                          }
                          onChange={(suKien) =>
                            doiMucKyNang(
                              kyNang.id,
                              thanhVien.user_id,
                              Number(suKien.target.value),
                            )
                          }
                        >
                          <option value={0}>{t("Chưa chấm", "Unrated")}</option>
                          {[1, 2, 3, 4, 5].map((n) => (
                            <option key={n} value={n}>
                              {n} / 5
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
