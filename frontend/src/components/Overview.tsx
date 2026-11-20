"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import { formatTimestamp } from "@/lib/dates";
import type {
  Analytics,
  Member,
  Project,
  Workload,
  Workspace,
} from "@/lib/types";

type Dashboard = {
  total_projects: number;
  active_projects: number;
  total_tasks: number;
  completed_tasks: number;
  in_progress_tasks: number;
  overdue_tasks: number;
  upcoming_deadlines: {
    task_id: number;
    project_id: number;
    title: string;
    due_date: string;
  }[];
  recent_activities: {
    id: number;
    action: string;
    entity: string;
    entity_id: number;
    created_at: string;
  }[];
  workload: Workload["members"];
};
export default function Overview({
  workspace,
  projects,
  mode = "dashboard",
  refreshKey = 0,
  onOpenProject,
}: {
  workspace: Workspace;
  projects: Project[];
  mode?: "dashboard" | "workload" | "analytics";
  refreshKey?: number;
  onOpenProject: (duAn: Project) => void;
}) {
  const { language, t, message: messageText } = useLanguage();
  const [tongQuan, datTongQuan] = useState<Dashboard | null>(null);
  const [thongKeDuAn, datThongKeDuAn] = useState<Record<number, Analytics>>({});
  const [thanhVien, datThanhVien] = useState<Member[]>([]);
  const [loi, datLoi] = useState("");
  const [loiThongKe, datLoiThongKe] = useState<Record<number, string>>({});
  useEffect(() => {
    // Bỏ qua kết quả trả muộn nếu người dùng đã chuyển sang workspace khác.
    let conHieuLuc = true;
    datTongQuan(null);
    datLoi("");
    datThongKeDuAn({});
    datLoiThongKe({});
    api
      .get<Dashboard>(`/workspaces/${workspace.id}/dashboard`)
      .then((value) => {
        if (conHieuLuc) datTongQuan(value);
      })
      .catch((loi) => {
        if (conHieuLuc) datLoi(loi.message);
      });
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then((value) => {
        if (conHieuLuc) datThanhVien(value);
      })
      .catch((loi) => {
        if (conHieuLuc) datLoi(loi.message);
      });
    Promise.all(
      projects.map((duAn) =>
        api
          .get<Analytics>(`/projects/${duAn.id}/analytics`)
          .then((banGhi) => [duAn.id, banGhi] as const)
          .catch((loi) => {
            if (conHieuLuc)
              datLoiThongKe((errors) => ({
                ...errors,
                [duAn.id]: loi.message,
              }));
            return null;
          }),
      ),
    ).then((ketQuaTheoDuAn) => {
      if (!conHieuLuc) return;
      const bangThongKe: Record<number, Analytics> = {};
      for (const ketQua of ketQuaTheoDuAn) {
        if (ketQua === null) continue;
        const [maDuAn, thongKe] = ketQua;
        bangThongKe[maDuAn] = thongKe;
      }
      datThongKeDuAn(bangThongKe);
    });
    return () => {
      conHieuLuc = false;
    };
  }, [workspace.id, projects, refreshKey]);
  if (loi) return <div className="error">{messageText(loi)}</div>;
  if (!tongQuan)
    return (
      <div className="skeleton-stack">
        <div />
        <div />
        <div />
      </div>
    );
  const duLieuBieuDo = projects.map((duAn) => ({
    name: duAn.name,
    [t("Hoàn thành", "Completed")]: thongKeDuAn[duAn.id]?.completed_tasks || 0,
    [t("Tổng", "Total")]: thongKeDuAn[duAn.id]?.total_tasks || 0,
  }));
  const dangTaiBieuDo = projects.some(
    (project) => !thongKeDuAn[project.id] && !loiThongKe[project.id],
  );
  const bieuDoCoLoi = Object.keys(loiThongKe).length > 0;
  const taiThanhVien = tongQuan.workload;
  const tenThanhVien = (id: number) =>
    thanhVien.find((nguoi) => nguoi.user_id === id)?.name ||
    `${t("Thành viên", "Member")} #${id}`;
  if (mode === "workload")
    return (
      <>
        <div className="section-intro">
          <h2>{t("Khối lượng của nhóm", "Team workload")}</h2>
          <p>
            {t(
              "Ước lượng công việc đang mở so với năng lực tuần này. Công việc con được tính riêng để tránh cộng lặp.",
              "Open work estimates against this week's capacity. Subtasks are counted separately to avoid duplicates.",
            )}
          </p>
        </div>
        <div className="panel table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Thành viên", "Member")}</th>
                <th>{t("Đã giao", "Assigned")}</th>
                <th>{t("Năng lực", "Capacity")}</th>
                <th>{t("Sử dụng", "Utilization")}</th>
                <th>{t("Trạng thái", "Status")}</th>
              </tr>
            </thead>
            <tbody>
              {taiThanhVien.map((thanhVien) => (
                <tr key={thanhVien.user_id}>
                  <td>{tenThanhVien(thanhVien.user_id)}</td>
                  <td>{thanhVien.assigned_hours}h</td>
                  <td>{thanhVien.capacity_hours}h</td>
                  <td>
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.min(thanhVien.percentage || 0, 100)}%`,
                        }}
                      />
                    </div>
                    {thanhVien.percentage ?? "—"}%
                  </td>
                  <td>
                    <span
                      className={`badge ${thanhVien.status === "OVERLOADED" ? "danger" : ""}`}
                    >
                      {enumLabel(thanhVien.status, language)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </>
    );
  if (mode === "analytics")
    return (
      <>
        <div className="section-intro">
          <h2>{t("Hiệu quả dự án", "Project performance")}</h2>
          <p>
            {t(
              "MAPE so sánh giờ thực tế của công việc đã hoàn thành với ước lượng lớn hơn 0 được chốt đầu tiên. Mức 0 khi tạo thẻ là chưa ước lượng. Sửa ước lượng về sau không đổi mốc này.",
              "MAPE compares actual hours of completed tasks with their first positive approved estimate. Zero on a new card means not yet estimated. Later edits do not change this baseline.",
            )}
          </p>
        </div>
        <div className="analytics-grid">
          {projects.map((duAn) => {
            const banGhi = thongKeDuAn[duAn.id];
            return (
              <button
                type="button"
                className="panel analytics-card"
                key={duAn.id}
                onClick={() => onOpenProject(duAn)}
              >
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                  {t("Kết quả dự án", "Project results")}
                </div>
                <h3>{duAn.name}</h3>
                {banGhi ? (
                  <>
                    <p>
                      {t("Hoàn thành", "Completed")}{" "}
                      <strong>{banGhi.completion_rate}%</strong> ·{" "}
                      {t("Quá hạn", "Overdue")}{" "}
                      <strong>{banGhi.overdue_tasks}</strong>
                    </p>
                    <div className="metric-row">
                      <div>
                        <small>
                          {t("Ước lượng hiện tại", "Current estimate")}
                        </small>
                        <strong>{banGhi.estimated_hours}h</strong>
                      </div>
                      <div>
                        <small>{t("Thực tế", "Actual")}</small>
                        <strong>{banGhi.actual_hours}h</strong>
                      </div>
                      <div>
                        <small>MAPE</small>
                        <strong>
                          {banGhi.mape === null
                            ? t("Chưa đủ dữ liệu", "Insufficient data")
                            : `${banGhi.mape}%`}
                        </strong>
                      </div>
                    </div>
                    <p>
                      AI:{" "}
                      {banGhi.ai_mape === null
                        ? t("Chưa đủ dữ liệu", "Insufficient data")
                        : `${banGhi.ai_mape}%`}{" "}
                      · {t("Con người", "Human")}:{" "}
                      {banGhi.human_mape === null
                        ? t("Chưa đủ dữ liệu", "Insufficient data")
                        : `${banGhi.human_mape}%`}
                    </p>
                    <p className="muted">
                      {banGhi.mape_sample_count}{" "}
                      {t("công việc đủ điều kiện", "eligible tasks")}
                    </p>
                  </>
                ) : (
                  <p>
                    {loiThongKe[duAn.id]
                      ? messageText(loiThongKe[duAn.id])
                      : t("Đang tải…", "Loading…")}
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </>
    );
  return (
    <>
      <div className="hero">
        <div>
          <span className="eyebrow">
            {t("TỔNG QUAN HỆ THỐNG", "SYSTEM OVERVIEW")}
          </span>
          <h2>{t("Tiến độ của nhóm", "Your team's progress")}</h2>
          <p>
            {t(
              "Tổng hợp tiến độ mọi dự án và khối lượng công việc của nhóm.",
              "Summary of projects progress and team workload.",
            )}
          </p>
        </div>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span>{t("Dự án", "Projects")}</span>
          <strong>{tongQuan.total_projects}</strong>
          <small>
            {tongQuan.active_projects} {t("đang hoạt động", "active")}
          </small>
        </div>
        <div className="stat-card">
          <span>{t("Công việc", "Tasks")}</span>
          <strong>{tongQuan.total_tasks}</strong>
          <small>{t("Trong tất cả dự án", "Across all projects")}</small>
        </div>
        <div className="stat-card">
          <span>{t("Đã hoàn thành", "Completed")}</span>
          <strong>{tongQuan.completed_tasks}</strong>
          <small>
            {tongQuan.total_tasks
              ? Math.round(
                  (tongQuan.completed_tasks / tongQuan.total_tasks) * 100,
                )
              : 0}
            % {t("tổng công việc", "of all tasks")}
          </small>
        </div>
        <div className="stat-card warning">
          <span>{t("Quá hạn", "Overdue")}</span>
          <strong>{tongQuan.overdue_tasks}</strong>
          <small>{t("Cần chú ý", "Needs attention")}</small>
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>{t("Tiến độ dự án", "Project progress")}</h3>
              <p className="muted">
                {t("Công việc hoàn thành / tổng số", "Completed tasks / total")}
              </p>
            </div>
          </div>
          {dangTaiBieuDo ? (
            <p className="muted" role="status">
              {t("Đang tải dữ liệu biểu đồ…", "Loading chart data…")}
            </p>
          ) : bieuDoCoLoi ? (
            <div className="error" role="alert">
              {t(
                "Chưa tải được đủ dữ liệu biểu đồ. Mở lại Tổng quan để thử lại.",
                "Unable to load all chart data. Reopen Overview to retry.",
              )}
            </div>
          ) : duLieuBieuDo.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={duLieuBieuDo}>
                  <CartesianGrid stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                  <YAxis allowDecimals={false} stroke="#64748b" fontSize={12} />
                  <Tooltip />
                  <Legend />
                  <Bar
                    isAnimationActive={false}
                    dataKey={t("Tổng", "Total")}
                    fill="#cbd5e1"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    isAnimationActive={false}
                    dataKey={t("Hoàn thành", "Completed")}
                    fill="#0f766e"
                    radius={[0, 0, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="muted">{t("Chưa có dự án.", "No projects yet.")}</p>
          )}
        </div>
        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>{t("Khối lượng nhóm", "Team workload")}</h3>
              <p className="muted">
                {t(
                  "Theo năng lực tuần hiện tại",
                  "Against this week's capacity",
                )}
              </p>
            </div>
          </div>
          <div className="workload-list">
            {taiThanhVien.slice(0, 6).map((thanhVien) => (
              <div key={thanhVien.user_id}>
                <div>
                  <span>{tenThanhVien(thanhVien.user_id)}</span>
                  <strong>{thanhVien.percentage ?? "—"}%</strong>
                </div>
                <div className="progress">
                  <span
                    style={{
                      width: `${Math.min(thanhVien.percentage || 0, 100)}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="panel">
        <div className="panel-header">
          <div>
            <h3>{t("Hạn sắp tới", "Upcoming deadlines")}</h3>
            <p className="muted">
              {t("Trong 7 ngày", "Next 7 days")} · {tongQuan.in_progress_tasks}{" "}
              {t("công việc đang thực hiện", "tasks in progress")}
            </p>
          </div>
        </div>
        <div className="project-list">
          {tongQuan.upcoming_deadlines.map((d) => (
            <button
              type="button"
              className="project-row"
              key={d.task_id}
              onClick={() => {
                const duAn = projects.find((duAn) => duAn.id === d.project_id);
                if (duAn) onOpenProject(duAn);
              }}
            >
              <span className="project-symbol">◷</span>
              <span>
                <strong>{d.title}</strong>
                <small>
                  {projects.find((duAn) => duAn.id === d.project_id)?.name}
                </small>
              </span>
              <span className="badge">{d.due_date}</span>
            </button>
          ))}
          {!tongQuan.upcoming_deadlines.length && (
            <p className="muted">
              {t(
                "Không có deadline trong 7 ngày.",
                "No deadlines in the next 7 days.",
              )}
            </p>
          )}
        </div>
      </div>
      <div className="dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <h3>{t("Dự án gần đây", "Recent projects")}</h3>
          </div>
          <div className="project-list">
            {projects.slice(0, 5).map((duAn) => (
              <button
                type="button"
                className="project-row"
                key={duAn.id}
                onClick={() => onOpenProject(duAn)}
              >
                <span className="project-symbol">▦</span>
                <span>
                  <strong>{duAn.name}</strong>
                  <small>{enumLabel(duAn.status, language)}</small>
                </span>
                <span>→</span>
              </button>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-header">
            <h3>{t("Hoạt động gần đây", "Recent activity")}</h3>
          </div>
          <div className="activity-list">
            {tongQuan.recent_activities.map((banGhi) => (
              <div key={banGhi.id}>
                <span className="activity-dot" />
                <span>
                  <strong>{enumLabel(banGhi.action, language)}</strong>
                  <small>
                    {enumLabel(banGhi.entity, language)} #{banGhi.entity_id} ·{" "}
                    {formatTimestamp(banGhi.created_at, language)}
                  </small>
                </span>
              </div>
            ))}
            {!tongQuan.recent_activities.length && (
              <p className="muted">
                {t("Chưa có hoạt động.", "No recent activity.")}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
