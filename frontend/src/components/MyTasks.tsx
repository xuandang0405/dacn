"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import type { Paged, Project, Task } from "@/lib/types";

type AssignedTask = { task: Task; project: Project };

export default function MyTasks({
  projects,
  userId,
  onOpenProject,
}: {
  projects: Project[];
  userId: number;
  onOpenProject: (project: Project) => void;
}) {
  const { language, t } = useLanguage();
  const [rows, setRows] = useState<AssignedTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      projects.map(async (project) => {
        const tasks: AssignedTask[] = [];
        let page = 1;
        let total = 0;
        do {
          const result = await api.get<Paged<Task>>(
            `/projects/${project.id}/tasks?assignee_id=${userId}&size=100&page=${page}`,
          );
          tasks.push(...result.items.map((task) => ({ task, project })));
          total = result.total;
          page++;
        } while (tasks.length < total);
        return tasks;
      }),
    )
      .then((groups) => {
        if (!cancelled) {
          setRows(
            groups
              .flat()
              .sort((a, b) =>
                (a.task.due_date || "9999-12-31").localeCompare(
                  b.task.due_date || "9999-12-31",
                ),
              ),
          );
          setError("");
        }
      })
      .catch((cause) => {
        if (!cancelled) setError((cause as Error).message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projects, userId]);

  return (
    <div className="panel">
      <div className="panel-header">
        <div>
          <h2>{t("CÔNG VIỆC CỦA TÔI", "MY TASKS")}</h2>
          <p className="muted">
            {t(
              "Danh sách công việc được phân công trong workspace.",
              "Tasks assigned to you in the current workspace.",
            )}
          </p>
        </div>
      </div>
      {loading && (
        <div className="muted" style={{ padding: "16px 0" }}>
          {t("Đang tải công việc…", "Loading tasks…")}
        </div>
      )}
      {error && <div className="error">{error}</div>}
      {!loading && !error && rows.length === 0 && (
        <p className="muted" style={{ padding: "28px 0", textAlign: "center" }}>
          {t("Chưa có công việc nào được phân công.", "No tasks assigned to you yet.")}
        </p>
      )}
      <div className="project-list">
        {rows.map(({ task, project }) => (
          <button
            className="project-row"
            key={task.id}
            onClick={() => onOpenProject(project)}
          >
            <span className="project-symbol">№</span>
            <span>
              <strong>
                № TSK-{task.id} · {task.title}
              </strong>
              <small>
                {project.name} · {t("Hạn", "Due")}{" "}
                {task.due_date || t("chưa đặt", "not set")} · EST {task.estimated_hours}h
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
