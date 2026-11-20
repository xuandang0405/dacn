"use client";
import { useEffect, useState } from "react";
import { ListTodo } from "lucide-react";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import type { Paged, Project, Task } from "@/lib/types";

type AssignedTask = { task: Task; project: Project };

export default function MyTasks({
  projects,
  userId,
  refreshKey,
  onOpenProject,
}: {
  projects: Project[];
  userId: number;
  refreshKey: number;
  onOpenProject: (project: Project, taskId: number) => void;
}) {
  const { language, t, message: messageText } = useLanguage();
  const [danhSachViec, datDanhSachViec] = useState<AssignedTask[]>([]);
  const [dangTai, datDangTai] = useState(true);
  const [loi, datLoi] = useState("");

  useEffect(() => {
    let daHuy = false;
    datDangTai(true);
    datDanhSachViec([]);
    datLoi("");
    Promise.all(
      projects.map(async (project) => {
        const viecTrongDuAn: AssignedTask[] = [];
        let trang = 1;
        let tongSoViec = 0;
        do {
          const ketQua = await api.get<Paged<Task>>(
            `/projects/${project.id}/tasks?assignee_id=${userId}&include_subtasks=true&size=100&page=${trang}`,
          );
          viecTrongDuAn.push(
            ...ketQua.items.map((task) => ({ task, project })),
          );
          tongSoViec = ketQua.total;
          trang++;
          if (ketQua.items.length === 0) break;
        } while (viecTrongDuAn.length < tongSoViec);
        return viecTrongDuAn;
      }),
    )
      .then((viecTheoDuAn) => {
        if (!daHuy) {
          datDanhSachViec(
            viecTheoDuAn
              .flat()
              .sort((a, b) =>
                (a.task.due_date || "9999-12-31").localeCompare(
                  b.task.due_date || "9999-12-31",
                ),
              ),
          );
          datLoi("");
        }
      })
      .catch((loi) => {
        if (!daHuy) datLoi((loi as Error).message);
      })
      .finally(() => {
        if (!daHuy) datDangTai(false);
      });
    return () => {
      daHuy = true;
    };
  }, [projects, userId, refreshKey]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t("Công việc được giao", "Assigned tasks")}</h2>
          <p className="muted">
            {t(
              "Danh sách công việc được phân công trong workspace.",
              "Tasks assigned to you in the current workspace.",
            )}
          </p>
        </div>
      </div>
      {dangTai && (
        <div className="muted" style={{ padding: "16px 0" }}>
          {t("Đang tải công việc…", "Loading tasks…")}
        </div>
      )}
      {loi && <div className="error">{messageText(loi)}</div>}
      {!dangTai && !loi && danhSachViec.length === 0 && (
        <p className="muted" style={{ padding: "28px 0", textAlign: "center" }}>
          {t(
            "Chưa có công việc nào được phân công.",
            "No tasks assigned to you yet.",
          )}
        </p>
      )}
      <div className="project-list">
        {!dangTai &&
          !loi &&
          danhSachViec.map(({ task, project }) => (
            <button
              type="button"
              className="project-row"
              key={task.id}
              onClick={() => onOpenProject(project, task.id)}
            >
              <span className="project-symbol">
                <ListTodo size={16} />
              </span>
              <span>
                <strong>{task.title}</strong>
                <small>
                  {project.name} ·{" "}
                  {task.assignee_id !== userId && (
                    <>
                      {t(
                        "Bạn được giao việc con",
                        "You have an assigned subtask",
                      )}{" "}
                      ·{" "}
                    </>
                  )}
                  {t("Hạn", "Due")} {task.due_date || t("chưa đặt", "not set")}{" "}
                  · {t("Ước lượng", "Estimate")} {task.estimated_hours}h
                </small>
              </span>
              <span className={`priority ${task.priority.toLowerCase()}`}>
                {enumLabel(task.priority, language)}
              </span>
              <span>→</span>
            </button>
          ))}
      </div>
    </div>
  );
}
