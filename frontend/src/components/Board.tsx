"use client";
import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Clock3, Plus, Settings2, X } from "lucide-react";
import { api, base, getToken } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import type {
  Column,
  Member,
  Paged,
  Project,
  Task,
  Workspace,
} from "@/lib/types";

type Subtask = {
  id: number;
  task_id: number;
  title: string;
  description: string;
  done: boolean;
  assignee_id: number | null;
  estimated_hours: number;
  actual_hours: number;
  due_date: string | null;
};
type Comment = {
  id: number;
  author_id: number;
  content: string;
  created_at: string;
};
type Activity = {
  id: number;
  action: string;
  actor_id: number;
  created_at: string;
  detail: Record<string, unknown>;
};
export default function Board({
  project,
  workspace,
  onProjectChange,
  onDeleted,
}: {
  project: Project;
  workspace: Workspace;
  onProjectChange: (p: Project) => void;
  onDeleted: () => void;
}) {
  const { language, t: tr } = useLanguage();
  const [columns, setColumns] = useState<Column[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [projectMembers, setProjectMembers] = useState<number[]>([]);
  const [selected, setSelected] = useState<Task | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newColumn, setNewColumn] = useState("");
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [projectName, setProjectName] = useState(project.name);
  const [projectDescription, setProjectDescription] = useState(
    project.description,
  );
  const [projectStatus, setProjectStatus] = useState(project.status);
  const load = useCallback(async () => {
    try {
      const [cols, people, pm] = await Promise.all([
        api.get<Column[]>(`/projects/${project.id}/columns`),
        api.get<Member[]>(`/workspaces/${workspace.id}/members`),
        api.get<number[]>(`/projects/${project.id}/members`),
      ]);
      const rows: Task[] = [];
      let page = 1,
        total = 0;
      do {
        const data = await api.get<Paged<Task>>(
          `/projects/${project.id}/tasks?size=100&page=${page}`,
        );
        rows.push(...data.items);
        total = data.total;
        page++;
      } while (rows.length < total && page < 100);
      setColumns(cols);
      setTasks(rows);
      setMembers(people);
      setProjectMembers(pm);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [project.id, workspace.id]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => {
    let ws: WebSocket | undefined;
    let closed = false;
    const connect = () => {
      const token = getToken();
      if (!token || closed) return;
      ws = new WebSocket(
        `${base.replace(/^http/, "ws")}/api/v1/ws/projects/${project.id}`,
      );
      ws.onopen = () => ws?.send(token);
      ws.onmessage = (e) => {
        const message = JSON.parse(e.data);
        if (message.event !== "connected") load();
      };
      ws.onclose = () => {
        if (!closed) setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, [project.id, load]);
  async function createTask(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setBusy(true);
    try {
      await api.post(`/projects/${project.id}/tasks`, {
        title: newTitle.trim(),
        description: "",
        priority: "MEDIUM",
        estimated_hours: 0,
        actual_hours: 0,
      });
      setNewTitle("");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function move(task: Task, column_id: number, position: number) {
    setBusy(true);
    try {
      await api.post(`/tasks/${task.id}/move`, {
        column_id,
        position,
        version: task.version,
      });
      await load();
    } catch (e) {
      setError((e as Error).message);
      await load();
    } finally {
      setBusy(false);
    }
  }
  async function addColumn(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/projects/${project.id}/columns`, {
        name: newColumn,
        is_done: false,
      });
      setNewColumn("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function addMember(userId: number) {
    try {
      await api.post(`/projects/${project.id}/members/${userId}`);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    try {
      const updated = await api.put<Project>(`/projects/${project.id}`, {
        name: projectName,
        description: projectDescription,
        status: projectStatus,
        start_date: project.start_date || null,
        end_date: project.end_date || null,
      });
      onProjectChange(updated);
      setSettingsOpen(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function deleteProject() {
    if (
      !confirm(
        tr(
          "Xóa dự án và toàn bộ task?",
          "Delete the project and all its tasks?",
        ),
      )
    )
      return;
    try {
      await api.delete(`/projects/${project.id}`);
      onDeleted();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const visibleTasks = tasks.filter(
    (task) =>
      (!query ||
        `${task.title} ${task.description}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase())) &&
      (!priorityFilter || task.priority === priorityFilter) &&
      (!assigneeFilter || task.assignee_id === assigneeFilter),
  );
  return (
    <>
      <div className="board-header">
        <div>
          <div className="eyebrow">
            PROJECT № {String(project.id).padStart(2, "0")} · {enumLabel(project.status, language)}
          </div>
          <h2>{project.name}</h2>
          <p>
            {project.description ||
              tr(
                "Bảng điều phối và theo dõi công việc theo thời gian thực.",
                "Proofing desk and real-time task ledger.",
              )}
          </p>
        </div>
        <div className="board-actions">
          <button
            className="button subtle"
            onClick={() => setSettingsOpen(!settingsOpen)}
          >
            <Settings2 size={15} /> {tr("Cài đặt dự án", "Project settings")}
          </button>
          <div className="member-avatars">
            {members
              .filter((m) => projectMembers.includes(m.user_id))
              .slice(0, 4)
              .map((m) => (
                <span key={m.user_id} className="avatar small" title={m.name}>
                  {m.name[0]}
                </span>
              ))}
          </div>
          <select
            aria-label={tr("Thêm thành viên dự án", "Add project member")}
            value=""
            onChange={(e) => addMember(Number(e.target.value))}
          >
            <option value="">+ {tr("Thành viên", "Member")}</option>
            {members
              .filter((m) => !projectMembers.includes(m.user_id))
              .map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
          </select>
        </div>
      </div>
      {settingsOpen && (
        <form className="panel project-settings" onSubmit={saveProject}>
          <h3>{tr("Cài đặt dự án", "Project settings")}</h3>
          <div className="field-grid">
            <label>
              {tr("Tên dự án", "Project name")}
              <input
                required
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
              />
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select
                value={projectStatus}
                onChange={(e) => setProjectStatus(e.target.value)}
              >
                {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map(
                  (x) => (
                    <option key={x} value={x}>
                      {enumLabel(x, language)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label>
            {tr("Mô tả", "Description")}
            <textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
            />
          </label>
          <div className="drawer-actions">
            <button className="button primary">
              {tr("Lưu thay đổi", "Save changes")}
            </button>
            <button
              type="button"
              className="button danger"
              onClick={deleteProject}
            >
              {tr("Xóa dự án", "Delete project")}
            </button>
          </div>
        </form>
      )}
      {error && (
        <div className="error">
          <button onClick={() => setError("")}>×</button>
          {error}
        </div>
      )}
      <div className="board-toolbar">
        <form onSubmit={createTask} className="inline-form">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder={tr("Tên công việc mới...", "New task title...")}
            required
          />
          <button className="button primary" disabled={busy}>
            <Plus size={16} /> {tr("Tạo công việc", "Create task")}
          </button>
        </form>
        <span className="muted">
          {tasks.length} {tr("công việc", "tasks")}
        </span>
      </div>
      <div className="board-filters">
        <input
          aria-label={tr("Tìm công việc", "Search tasks")}
          placeholder={tr("Tìm kiếm công việc...", "Search tasks...")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label={tr("Lọc ưu tiên", "Filter priority")}
          value={priorityFilter}
          onChange={(e) => setPriorityFilter(e.target.value)}
        >
          <option value="">{tr("Mọi ưu tiên", "All priorities")}</option>
          {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
            <option key={p} value={p}>
              {enumLabel(p, language)}
            </option>
          ))}
        </select>
        <select
          aria-label={tr("Lọc người thực hiện", "Filter assignee")}
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(Number(e.target.value))}
        >
          <option value={0}>{tr("Mọi thành viên", "All members")}</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      <div className="kanban">
        {columns.map((col) => {
          const items = visibleTasks
            .filter((t) => t.column_id === col.id)
            .sort((a, b) => a.position - b.position);
          return (
            <div
              className="kanban-column"
              key={col.id}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (query || priorityFilter || assigneeFilter) return;
                const id = Number(e.dataTransfer.getData("task-id"));
                const task = tasks.find((t) => t.id === id);
                if (task) move(task, col.id, items.length);
              }}
            >
              <div className="column-head">
                <span className={`column-dot ${col.is_done ? "done" : ""}`} />
                <strong>{col.name}</strong>
                <span className="count">
                  [{String(items.length).padStart(2, "0")}]
                </span>
              </div>
              <div className="column-body">
                {items.map((t, index) => (
                  <div
                    key={t.id}
                    draggable={!query && !priorityFilter && !assigneeFilter}
                    onDragStart={(e) =>
                      e.dataTransfer.setData("task-id", String(t.id))
                    }
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (query || priorityFilter || assigneeFilter) return;
                      const id = Number(e.dataTransfer.getData("task-id"));
                      const task = tasks.find((x) => x.id === id);
                      if (task) move(task, col.id, index);
                    }}
                    className="task-card"
                    onClick={() => setSelected(t)}
                  >
                    <div className="task-card-header">
                      <span className="task-card-id">№ TSK-{t.id}</span>
                      <span className={`priority ${t.priority.toLowerCase()}`}>
                        {enumLabel(t.priority, language)}
                      </span>
                    </div>
                    <h4>{t.title}</h4>
                    {t.description && <p>{t.description}</p>}
                    <div className="task-meta">
                      <span
                        title={tr(
                          "Ước lượng / Thực tế",
                          "Estimated / Actual",
                        )}
                      >
                        <Clock3 size={12} />
                        EST {t.estimated_hours}h · ACT {t.actual_hours}h
                      </span>
                      {t.due_date && (
                        <span title={tr("Hạn hoàn thành", "Due date")}>
                          <CalendarDays size={12} />
                          {t.due_date}
                        </span>
                      )}
                      <span
                        className="avatar tiny"
                        title={
                          members.find((m) => m.user_id === t.assignee_id)
                            ?.name || tr("Chưa giao", "Unassigned")
                        }
                      >
                        {members
                          .find((m) => m.user_id === t.assignee_id)
                          ?.name[0]?.toUpperCase() || "—"}
                      </span>
                    </div>
                  </div>
                ))}
                {!items.length && (
                  <div className="column-empty">
                    [{" "}
                    {tr(
                      "Khay trống — Thả task vào đây",
                      "Empty tray — Drop task here",
                    )}{" "}
                    ]
                  </div>
                )}
              </div>
            </div>
          );
        })}
        <div className="kanban-add">
          <form onSubmit={addColumn}>
            <input
              value={newColumn}
              onChange={(e) => setNewColumn(e.target.value)}
              placeholder={tr("Tên cột mới", "New column name")}
              required
            />
            <button className="button subtle">+ {tr("Thêm cột", "Add column")}</button>
          </form>
        </div>
      </div>
      {selected && (
        <TaskPanel
          projectId={project.id}
          task={tasks.find((t) => t.id === selected.id) || selected}
          members={members}
          onClose={() => setSelected(null)}
          onChanged={() => {
            load();
          }}
        />
      )}
    </>
  );
}

function TaskPanel({
  projectId,
  task,
  members,
  onClose,
  onChanged,
}: {
  projectId: number;
  task: Task;
  members: Member[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const { language, t: tr } = useLanguage();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description);
  const [priority, setPriority] = useState(task.priority);
  const [assignee, setAssignee] = useState(task.assignee_id || 0);
  const [estimated, setEstimated] = useState(task.estimated_hours);
  const [actual, setActual] = useState(task.actual_hours);
  const [due, setDue] = useState(task.due_date || "");
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [requiredSkills, setRequiredSkills] = useState<string[]>([]);
  const [newSub, setNewSub] = useState("");
  const [newComment, setNewComment] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function load() {
    try {
      const [s, c, a, skills] = await Promise.all([
        api.get<Subtask[]>(`/tasks/${task.id}/subtasks`),
        api.get<Comment[]>(`/tasks/${task.id}/comments`),
        api.get<Activity[]>(`/tasks/${task.id}/activity`),
        api.get<string[]>(`/tasks/${task.id}/required-skills`),
      ]);
      setSubtasks(s);
      setComments(c);
      setActivities(a);
      setRequiredSkills(skills);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    load();
  }, [task.id]);
  useEffect(() => {
    setTitle(task.title);
    setDescription(task.description);
    setPriority(task.priority);
    setAssignee(task.assignee_id || 0);
    setEstimated(task.estimated_hours);
    setActual(task.actual_hours);
    setDue(task.due_date || "");
  }, [task.version]);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/tasks/${task.id}`, {
        title,
        description,
        priority,
        assignee_id: assignee || null,
        estimated_hours: Number(estimated),
        actual_hours: Number(actual),
        due_date: due || null,
        version: task.version,
      });
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function addSub(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/tasks/${task.id}/subtasks`, {
        title: newSub,
        description: "",
        done: false,
        estimated_hours: 0,
        actual_hours: 0,
      });
      setNewSub("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function toggleSub(s: Subtask) {
    try {
      await api.put(`/subtasks/${s.id}`, {
        title: s.title,
        description: s.description,
        done: !s.done,
        assignee_id: s.assignee_id,
        estimated_hours: s.estimated_hours,
        actual_hours: s.actual_hours,
        due_date: s.due_date,
      });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function comment(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api.post(`/tasks/${task.id}/comments`, { content: newComment });
      setNewComment("");
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function remove() {
    if (!confirm(tr("Xóa task này?", "Delete this task?"))) return;
    try {
      await api.delete(`/tasks/${task.id}`);
      onClose();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div
      className="drawer-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="drawer">
        <div className="drawer-top">
          <span className="eyebrow">
            PROJECT № {String(projectId).padStart(2, "0")} // TASK № TSK-{task.id} · REV {task.version} · EST: {task.estimate_source}
          </span>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label={tr("Đóng", "Close")}
          >
            <X size={18} />
          </button>
        </div>
        {error && <div className="error">{error}</div>}
        <form onSubmit={save}>
          <label>
            {tr("Tiêu đề", "Title")}
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </label>
          <label>
            {tr("Mô tả", "Description")}
            <textarea
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <div className="field-grid">
            <label>
              {tr("Ưu tiên", "Priority")}
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
              >
                {["LOW", "MEDIUM", "HIGH", "URGENT"].map((x) => (
                  <option key={x} value={x}>
                    {enumLabel(x, language)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Người thực hiện", "Assignee")}
              <select
                value={assignee}
                onChange={(e) => setAssignee(Number(e.target.value))}
              >
                <option value={0}>{tr("Chưa giao", "Unassigned")}</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {tr("Ước lượng (giờ)", "Estimate (hours)")}
              <input
                type="number"
                min="0"
                step="0.25"
                value={estimated}
                onChange={(e) => setEstimated(Number(e.target.value))}
              />
            </label>
            <label>
              {tr("Thực tế (giờ)", "Actual (hours)")}
              <input
                type="number"
                min="0"
                step="0.25"
                value={actual}
                onChange={(e) => setActual(Number(e.target.value))}
              />
            </label>
            <label>
              {tr("Hạn hoàn thành", "Due date")}
              <input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
              />
            </label>
          </div>
          <div className="drawer-actions">
            <button className="button primary" disabled={busy}>
              {tr("Lưu thay đổi", "Save changes")}
            </button>
            <button className="button danger" type="button" onClick={remove}>
              {tr("Xóa", "Delete")}
            </button>
          </div>
        </form>
        <section className="drawer-section">
          <h3>{tr("Kỹ năng cần thiết", "Required skills")}</h3>
          <p>
            {requiredSkills.length
              ? requiredSkills.join(" · ")
              : tr("Chưa có kỹ năng được ghi nhận.", "No skills recorded yet.")}
          </p>
        </section>
        <section className="drawer-section">
          <h3>
            {tr("Công việc con", "Subtasks")}{" "}
            <span className="count">[{String(subtasks.length).padStart(2, "0")}]</span>
          </h3>
          {subtasks.map((s) => (
            <label className="subtask-row" key={s.id}>
              <input
                type="checkbox"
                checked={s.done}
                onChange={() => toggleSub(s)}
              />
              <span className={s.done ? "strike" : ""}>{s.title}</span>
              <small>{s.estimated_hours}h</small>
            </label>
          ))}
          <form className="inline-form" onSubmit={addSub}>
            <input
              required
              value={newSub}
              onChange={(e) => setNewSub(e.target.value)}
              placeholder={tr("Tên việc con mới...", "New subtask title...")}
            />
            <button className="button subtle">+ {tr("Thêm", "Add")}</button>
          </form>
        </section>
        <section className="drawer-section">
          <h3>{tr("Bình luận", "Comments")}</h3>
          {comments.map((c) => (
            <div className="comment" key={c.id}>
              <span className="avatar small">
                {members.find((m) => m.user_id === c.author_id)?.name[0] || "U"}
              </span>
              <div>
                <small>
                  {members.find((m) => m.user_id === c.author_id)?.name ||
                    `User #${c.author_id}`}{" "}
                  ·{" "}
                  {new Date(c.created_at).toLocaleString(
                    language === "vi" ? "vi-VN" : "en-US",
                  )}
                </small>
                <p>{c.content}</p>
              </div>
            </div>
          ))}
          <form onSubmit={comment}>
            <textarea
              required
              rows={2}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder={tr(
                "Viết bình luận. Mention bằng @username...",
                "Write a comment. Mention with @username...",
              )}
            />
            <button className="button primary">
              {tr("Gửi bình luận", "Post comment")}
            </button>
          </form>
        </section>
        <section className="drawer-section">
          <h3>{tr("Nhật ký hoạt động", "Activity log")}</h3>
          <div className="activity-list">
            {activities.map((a) => (
              <div key={a.id}>
                <span className="activity-dot" />
                <span>
                  <strong>{a.action}</strong>
                  <small>
                    {members.find((m) => m.user_id === a.actor_id)?.name ||
                      `User #${a.actor_id}`}{" "}
                    ·{" "}
                    {new Date(a.created_at).toLocaleString(
                      language === "vi" ? "vi-VN" : "en-US",
                    )}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
