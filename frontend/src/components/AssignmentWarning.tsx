"use client";

import { useEffect, useState } from "react";
import { TriangleAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useLanguage } from "@/lib/language";
import type { Task } from "@/lib/types";

type Advice = {
  version: number;
  assignee_name: string;
  assigned_hours: number;
  capacity_hours: number;
  percentage: number | null;
  replacement: {
    user_id: number;
    name: string;
    skill_match: number | null;
    projected_percentage: number;
  } | null;
};

export default function AssignmentWarning({
  task,
  disabled,
  onChanged,
  onDismiss,
}: {
  task: Task;
  disabled: boolean;
  onChanged: () => Promise<void>;
  onDismiss: () => void;
}) {
  const { t, message } = useLanguage();
  const [advice, setAdvice] = useState<Advice | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [movedTo, setMovedTo] = useState("");
  const path = `/tasks/${task.id}/assignment-advice`;

  useEffect(() => {
    let active = true;
    api
      .get<Advice | null>(path)
      .then((result) => {
        if (active) setAdvice(result);
      })
      .catch((error: Error) => {
        if (active) setError(error.message);
      });
    return () => {
      active = false;
    };
  }, [path]);

  async function reassign() {
    if (!advice?.replacement || disabled || saving) return;
    setSaving(true);
    setError("");
    try {
      const latest = await api.get<Advice | null>(path);
      if (
        !latest ||
        latest.version !== advice.version ||
        latest.replacement?.user_id !== advice.replacement.user_id
      ) {
        setAdvice(latest);
        setError(
          t(
            "Khối lượng hoặc công việc vừa thay đổi. Hãy kiểm tra lại gợi ý.",
            "Workload or task details changed. Review the latest suggestion.",
          ),
        );
        await onChanged();
        return;
      }
      await api.patch(`/tasks/${task.id}`, {
        assignee_id: latest.replacement.user_id,
        version: latest.version,
      });
      setMovedTo(latest.replacement.name);
      setAdvice(null);
      await onChanged();
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!advice && !error && !movedTo) return null;
  return (
    <section
      className="assignment-warning"
      aria-label={t("Kiểm tra quá tải", "Workload check")}
    >
      {advice && (
        <>
          <div role="status">
            <strong>
              <TriangleAlert size={16} aria-hidden />{" "}
              {t("Cảnh báo quá tải (Burnout)", "Burnout risk warning")}
            </strong>
            <p>
              {task.title} · {advice.assignee_name} · {advice.assigned_hours}/
              {advice.capacity_hours} {t("giờ trong 7 ngày", "hours in 7 days")}
              {advice.percentage !== null && ` (${advice.percentage}%)`}
            </p>
            <p>
              {advice.replacement
                ? t(
                    `Đề xuất giao cho ${advice.replacement.name}. Tải sau khi nhận việc: ${advice.replacement.projected_percentage}%.`,
                    `Suggested assignee: ${advice.replacement.name}. Projected workload: ${advice.replacement.projected_percentage}%.`,
                  )
                : t(
                    "Chưa có thành viên phù hợp còn đủ giờ nhận việc này.",
                    "No eligible teammate has enough capacity for this task.",
                  )}
              {advice.replacement?.skill_match != null &&
                t(
                  ` Khớp kỹ năng ${advice.replacement.skill_match}%.`,
                  ` Skill match: ${advice.replacement.skill_match}%.`,
                )}
            </p>
          </div>
          {advice.replacement && (
            <button
              type="button"
              className="button primary"
              onClick={reassign}
              disabled={disabled || saving}
            >
              {saving
                ? t("Đang chuyển…", "Reassigning…")
                : t("Xác nhận chuyển người", "Confirm reassignment")}
            </button>
          )}
        </>
      )}
      {error && <p role="alert">{message(error)}</p>}
      {movedTo && (
        <p role="status">
          {t(
            `Đã chuyển công việc cho ${movedTo}.`,
            `Task reassigned to ${movedTo}.`,
          )}
        </p>
      )}
      <button
        type="button"
        className="button subtle"
        onClick={onDismiss}
        disabled={saving}
      >
        {t("Ẩn thông báo", "Dismiss")}
      </button>
    </section>
  );
}
