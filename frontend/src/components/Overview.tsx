"use client";
import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
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
  onOpenProject,
}: {
  workspace: Workspace;
  projects: Project[];
  mode?: "dashboard" | "workload" | "analytics";
  onOpenProject: (p: Project) => void;
}) {
  const { language, t } = useLanguage();
  const [data, setData] = useState<Dashboard | null>(null);
  const [analytics, setAnalytics] = useState<Record<number, Analytics>>({});
  const [people, setPeople] = useState<Member[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    setData(null);
    setError("");
    api
      .get<Dashboard>(`/workspaces/${workspace.id}/dashboard`)
      .then(setData)
      .catch((e) => setError(e.message));
    api
      .get<Member[]>(`/workspaces/${workspace.id}/members`)
      .then(setPeople)
      .catch(() => {});
    Promise.all(
      projects.map((p) =>
        api
          .get<Analytics>(`/projects/${p.id}/analytics`)
          .then((a) => [p.id, a] as const)
          .catch(() => null),
      ),
    ).then((rows) =>
      setAnalytics(
        Object.fromEntries(
          rows.filter((x): x is readonly [number, Analytics] => x !== null),
        ),
      ),
    );
  }, [workspace.id, projects]);
  if (error) return <div className="error">{error}</div>;
  if (!data)
    return (
      <div className="skeleton-stack">
        <div />
        <div />
        <div />
      </div>
    );
  const chartData = projects.map((p) => ({
    name: p.name,
    [t("Hoàn thành", "Completed")]: analytics[p.id]?.completed_tasks || 0,
    [t("Tổng", "Total")]: analytics[p.id]?.total_tasks || 0,
  }));
  const members = data.workload;
  const memberName = (id: number) =>
    people.find((p) => p.user_id === id)?.name ||
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
        <div className="panel">
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
              {members.map((m) => (
                <tr key={m.user_id}>
                  <td>{memberName(m.user_id)}</td>
                  <td>{m.assigned_hours}h</td>
                  <td>{m.capacity_hours}h</td>
                  <td>
                    <div className="progress">
                      <span
                        style={{
                          width: `${Math.min(m.percentage || 0, 100)}%`,
                        }}
                      />
                    </div>
                    {m.percentage ?? "—"}%
                  </td>
                  <td>
                    <span
                      className={`badge ${m.status === "OVERLOADED" ? "danger" : ""}`}
                    >
                      {enumLabel(m.status, language)}
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
              "MAPE chỉ tính công việc có giờ thực tế lớn hơn 0. Thiếu dữ liệu sẽ hiển thị “Insufficient Data”.",
              "MAPE includes only tasks with actual hours above zero. Missing data is shown as “Insufficient Data”.",
            )}
          </p>
        </div>
        <div className="analytics-grid">
          {projects.map((p) => {
            const a = analytics[p.id];
            return (
              <button
                className="panel analytics-card"
                key={p.id}
                onClick={() => onOpenProject(p)}
              >
                <div className="eyebrow" style={{ marginBottom: 4 }}>
                  ESTIMATION NOTE § {String(p.id).padStart(2, "0")}
                </div>
                <h3>{p.name}</h3>
                {a ? (
                  <>
                    <p>
                      {t("Hoàn thành", "Completed")}{" "}
                      <strong>{a.completion_rate}%</strong> ·{" "}
                      {t("Quá hạn", "Overdue")}{" "}
                      <strong>{a.overdue_tasks}</strong>
                    </p>
                    <div className="metric-row">
                      <div>
                        <small>Estimated</small>
                        <strong>{a.estimated_hours}h</strong>
                      </div>
                      <div>
                        <small>Actual</small>
                        <strong>{a.actual_hours}h</strong>
                      </div>
                      <div>
                        <small>MAPE</small>
                        <strong>
                          {a.mape === null ? "Insufficient Data" : `${a.mape}%`}
                        </strong>
                      </div>
                    </div>
                    <p>
                      AI:{" "}
                      {a.ai_mape === null
                        ? "Insufficient Data"
                        : `${a.ai_mape}%`}{" "}
                      · Human:{" "}
                      {a.human_mape === null
                        ? "Insufficient Data"
                        : `${a.human_mape}%`}
                    </p>
                  </>
                ) : (
                  <p>{t("Đang tải…", "Loading…")}</p>
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
          <h2>{t("Bảng theo dõi tổng hợp", "Summary ledger")}</h2>
          <p>
            {t(
              "Tổng hợp tiến độ mọi dự án và khối lượng công việc của nhóm.",
              "Summary of projects progress and team workload.",
            )}
          </p>
        </div>
        <div className="hero-graphic">§</div>
      </div>
      <div className="stat-grid">
        <div className="stat-card">
          <span>{t("Dự án", "Projects")}</span>
          <strong>{data.total_projects}</strong>
          <small>
            {data.active_projects} {t("đang hoạt động", "active")}
          </small>
        </div>
        <div className="stat-card">
          <span>{t("Công việc", "Tasks")}</span>
          <strong>{data.total_tasks}</strong>
          <small>{t("Trong tất cả dự án", "Across all projects")}</small>
        </div>
        <div className="stat-card">
          <span>{t("Đã hoàn thành", "Completed")}</span>
          <strong>{data.completed_tasks}</strong>
          <small>
            {data.total_tasks
              ? Math.round((data.completed_tasks / data.total_tasks) * 100)
              : 0}
            % {t("tổng công việc", "of all tasks")}
          </small>
        </div>
        <div className="stat-card warning">
          <span>{t("Quá hạn", "Overdue")}</span>
          <strong>{data.overdue_tasks}</strong>
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
          {chartData.length ? (
            <div className="chart">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#E7E0D6" vertical={false} />
                  <XAxis dataKey="name" stroke="#8C847D" fontSize={11} />
                  <YAxis allowDecimals={false} stroke="#8C847D" fontSize={11} />
                  <Tooltip />
                  <Bar
                    dataKey={t("Tổng", "Total")}
                    fill="#D3C9BC"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey={t("Hoàn thành", "Completed")}
                    fill="#242120"
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
            {members.slice(0, 6).map((m) => (
              <div key={m.user_id}>
                <div>
                  <span>{memberName(m.user_id)}</span>
                  <strong>{m.percentage ?? "—"}%</strong>
                </div>
                <div className="progress">
                  <span
                    style={{ width: `${Math.min(m.percentage || 0, 100)}%` }}
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
              {t("Trong 7 ngày", "Next 7 days")} · {data.in_progress_tasks}{" "}
              {t("công việc đang thực hiện", "tasks in progress")}
            </p>
          </div>
        </div>
        <div className="project-list">
          {data.upcoming_deadlines.map((d) => (
            <button
              className="project-row"
              key={d.task_id}
              onClick={() => {
                const p = projects.find((p) => p.id === d.project_id);
                if (p) onOpenProject(p);
              }}
            >
              <span className="project-symbol">◷</span>
              <span>
                <strong>{d.title}</strong>
                <small>
                  {projects.find((p) => p.id === d.project_id)?.name}
                </small>
              </span>
              <span className="badge">{d.due_date}</span>
            </button>
          ))}
          {!data.upcoming_deadlines.length && (
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
            {projects.slice(0, 5).map((p) => (
              <button
                className="project-row"
                key={p.id}
                onClick={() => onOpenProject(p)}
              >
                <span className="project-symbol">▦</span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{enumLabel(p.status, language)}</small>
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
            {data.recent_activities.map((a) => (
              <div key={a.id}>
                <span className="activity-dot" />
                <span>
                  <strong>{a.action}</strong>
                  <small>
                    {a.entity} #{a.entity_id} ·{" "}
                    {new Date(a.created_at).toLocaleString(
                      language === "vi" ? "vi-VN" : "en-US",
                    )}
                  </small>
                </span>
              </div>
            ))}
            {!data.recent_activities.length && (
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
