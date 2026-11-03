"use client";
import { useEffect, useState } from "react";
import { BookOpen, FileText, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { type DraftPlan, toDraft, toPlan } from "@/lib/ai-draft";
import { enumLabel, useLanguage } from "@/lib/language";
import type { AIPlan, Project, ProjectDocument } from "@/lib/types";
type Suggestion = {
  user_id: number;
  name: string;
  skill_match: number;
  workload_percent: number | null;
  overloaded: boolean;
};
export default function AIAssistant({
  project,
  projects,
  onSelectProject,
  onCreated,
}: {
  project: Project | null;
  projects: Project[];
  onSelectProject: (p: Project) => void;
  onCreated: () => void;
}) {
  const { language, t: tr, message: messageText } = useLanguage();
  const [story, setStory] = useState("");
  const [plan, setPlan] = useState<DraftPlan | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const projectId = project?.id;
  useEffect(() => {
    setDocuments([]);
    setPlan(null);
    setRequestId(null);
    setSuggestions({});
    setStory("");
    setQuestion("");
    setAnswer("");
    setError("");
    if (!projectId) return;
    setDocumentsLoading(true);
    let active = true;
    api
      .get<ProjectDocument[]>(`/ai/projects/${projectId}/documents`)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setDocumentsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [projectId]);
  async function upload(file: File | undefined) {
    if (!project || !file || busy || documentBusy || documentsLoading) return;
    setDocumentBusy(true);
    setError("");
    try {
      const row = await api.upload<ProjectDocument>(
        `/ai/projects/${project.id}/documents`,
        file,
      );
      setDocuments((current) => [...current, row]);
      setPlan(null);
      setAnswer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocumentBusy(false);
    }
  }
  async function removeDocument(id: number) {
    if (busy || documentBusy) return;
    setDocumentBusy(true);
    setError("");
    try {
      await api.delete(`/ai/documents/${id}`);
      setDocuments((current) => current.filter((row) => row.id !== id));
      setPlan(null);
      setAnswer("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDocumentBusy(false);
    }
  }
  async function query(mode: "analyze" | "ask") {
    if (
      !project ||
      busy ||
      documentBusy ||
      documentsLoading ||
      !documents.length ||
      (mode === "ask" && !question.trim())
    )
      return;
    setBusy(true);
    setError("");
    setAnswer("");
    try {
      const result = await api.post<{ answer: string }>(
        `/ai/projects/${project.id}/query`,
        {
          mode,
          question: mode === "ask" ? question.trim() : "",
          language,
        },
      );
      setAnswer(result.answer);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const [suggestions, setSuggestions] = useState<Record<string, Suggestion[]>>(
    {},
  );
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (
      !project ||
      busy ||
      documentBusy ||
      documentsLoading ||
      !documents.length
    )
      return;
    setBusy(true);
    setError("");
    try {
      const data = await api.post<{ request_id: number; plan: AIPlan }>(
        "/ai/decompose-task",
        { project_id: project.id, story, language },
      );
      setPlan(toDraft(data.plan));
      setSuggestions({});
      setRequestId(data.request_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!requestId || !plan || busy) return;
    setError("");
    setBusy(true);
    try {
      await api.post(`/ai/requests/${requestId}/confirm`, {
        plan: toPlan(plan),
      });
      onCreated();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function edit(index: number, key: string, value: string | number) {
    if (!plan) return;
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t, i) =>
        i === index ? { ...t, [key]: value } : t,
      ),
    });
  }
  function editSkills(index: number, value: string) {
    if (!plan) return;
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t, i) =>
        i === index
          ? {
              ...t,
              required_skills: value
                .split(",")
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 12),
            }
          : t,
      ),
    });
  }
  function editSubtask(
    index: number,
    childIndex: number,
    key: string,
    value: string | number,
  ) {
    if (!plan) return;
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t, i) =>
        i === index
          ? {
              ...t,
              subtasks: t.subtasks.map((s, j) =>
                j === childIndex ? { ...s, [key]: value } : s,
              ),
            }
          : t,
      ),
    });
  }
  function addSubtask(index: number) {
    if (!plan) return;
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t, i) =>
        i === index && t.subtasks.length < 15
          ? {
              ...t,
              subtasks: [
                ...t.subtasks,
                {
                  localId: crypto.randomUUID(),
                  title: tr("Công việc con mới", "New subtask"),
                  description: "",
                  estimated_hours: 0,
                },
              ],
            }
          : t,
      ),
    });
  }
  function removeSubtask(index: number, childIndex: number) {
    if (!plan) return;
    setPlan({
      ...plan,
      tasks: plan.tasks.map((t, i) =>
        i === index
          ? { ...t, subtasks: t.subtasks.filter((_, j) => j !== childIndex) }
          : t,
      ),
    });
  }
  function addTask() {
    if (!plan || plan.tasks.length >= 20) return;
    setPlan({
      ...plan,
      tasks: [
        ...plan.tasks,
        {
          localId: crypto.randomUUID(),
          title: tr("Công việc mới", "New task"),
          description: "",
          estimated_hours: 0,
          priority: "MEDIUM",
          required_skills: [],
          subtasks: [],
        },
      ],
    });
  }
  async function suggest(index: number) {
    if (!project || !plan) return;
    const localId = plan.tasks[index].localId;
    try {
      const skills = encodeURIComponent(
        plan.tasks[index].required_skills.join(","),
      );
      const rows = await api.get<Suggestion[]>(
        `/ai/projects/${project.id}/suggest-members?skills=${skills}`,
      );
      setSuggestions((current) => ({ ...current, [localId]: rows }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <div className="ai-layout">
      <div className="ai-intro">
        <div className="ai-icon">
          <BookOpen size={26} />
        </div>
        <span className="eyebrow">AI PROJECT ASSISTANT</span>
        <h2>
          {tr(
            "Hiểu tài liệu và lập kế hoạch dự án",
            "Understand documents and plan your project",
          )}
        </h2>
        <p>
          {tr(
            "Tải tài liệu của Project lên, rồi nhờ Gemini phân tích, hướng dẫn, trả lời câu hỏi hoặc chia nhỏ công việc.",
            "Upload project documents, then ask Gemini to analyze, guide, answer questions or break down work.",
          )}
        </p>
        <div className="ai-steps">
          <span>{tr("01 · Tải tài liệu", "01 · Upload documents")}</span>
          <span>{tr("02 · Hỏi hoặc phân tích", "02 · Ask or analyze")}</span>
          <span>{tr("03 · Lập kế hoạch", "03 · Create a plan")}</span>
        </div>
      </div>
      {error && (
        <div className="error" role="alert">
          {messageText(error)}
        </div>
      )}
      <div className="panel ai-form">
        <label>
          {tr("Dự án", "Project")}
          <select
            disabled={busy || documentBusy}
            value={project?.id || ""}
            onChange={(e) => {
              const selected = projects.find(
                (p) => p.id === Number(e.target.value),
              );
              if (selected) onSelectProject(selected);
            }}
          >
            {!project && (
              <option value="">{tr("Chọn dự án", "Select a project")}</option>
            )}
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <h3>{tr("Tài liệu dự án", "Project documents")}</h3>
        <p className="muted">
          {tr(
            "Tối đa 3 tệp PDF, DOCX, TXT hoặc MD; mỗi tệp tối đa 8 MB. Thành viên có quyền vào Project có thể dùng tài liệu này.",
            "Up to 3 PDF, DOCX, TXT or MD files, 8 MB each. Project members can use these documents.",
          )}
        </p>
        <div className="document-list">
          {documents.map((document) => (
            <div className="document-row" key={document.id}>
              <FileText size={18} />
              <span>{document.filename}</span>
              <small>{(document.size_bytes / 1024).toFixed(0)} KB</small>
              <button
                className="icon-button"
                type="button"
                title={tr("Xóa tài liệu", "Delete document")}
                disabled={busy || documentBusy || documentsLoading}
                onClick={() => removeDocument(document.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {documentsLoading && (
            <p className="muted">
              {tr("Đang tải tài liệu…", "Loading documents…")}
            </p>
          )}
          {!documentsLoading && !documents.length && (
            <p className="muted">
              {tr(
                "Chưa có tài liệu. Hãy tải lên trước khi hỏi AI.",
                "No documents yet. Upload one before asking AI.",
              )}
            </p>
          )}
        </div>
        <label
          className="button subtle"
          style={{ display: "inline-flex", gap: 8, cursor: "pointer" }}
        >
          <Upload size={17} />
          {documentBusy
            ? tr("Đang tải lên…", "Uploading…")
            : tr("Tải tài liệu lên", "Upload document")}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ display: "none" }}
            disabled={
              !project ||
              busy ||
              documentBusy ||
              documentsLoading ||
              documents.length >= 3
            }
            onChange={(e) => {
              const file = e.target.files?.[0];
              void upload(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      <div className="panel ai-form">
        <h3>{tr("Phân tích và hỏi đáp", "Analyze and ask")}</h3>
        <p className="muted">
          {tr(
            "Câu trả lời dựa trên tài liệu đã tải lên. Gemini sẽ nêu rõ khi tài liệu chưa có thông tin cần thiết.",
            "Answers are based on uploaded documents. Gemini will say when information is missing.",
          )}
        </p>
        <button
          type="button"
          className="button subtle"
          disabled={
            busy || documentBusy || documentsLoading || !documents.length
          }
          onClick={() => query("analyze")}
        >
          {tr("Phân tích dự án và hướng dẫn", "Analyze project and guide me")}
        </button>
        <label style={{ display: "block", marginTop: 16 }}>
          {tr("Câu hỏi về dự án", "Question about the project")}
          <textarea
            rows={3}
            maxLength={2000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={tr(
              "Ví dụ: Tôi nên bắt đầu từ đâu?",
              "For example: Where should I start?",
            )}
          />
        </label>
        <button
          type="button"
          className="button primary"
          disabled={
            busy ||
            documentBusy ||
            documentsLoading ||
            !documents.length ||
            !question.trim()
          }
          onClick={() => query("ask")}
        >
          {busy
            ? tr("Đang xử lý…", "Working…")
            : tr("Hỏi Gemini", "Ask Gemini")}
        </button>
        {answer && (
          <div className="ai-answer" aria-live="polite">
            <h4>{tr("Câu trả lời", "Answer")}</h4>
            {answer}
          </div>
        )}
      </div>
      <div className="panel ai-form">
        <h3>{tr("Chia nhỏ công việc", "Break down work")}</h3>
        <form onSubmit={generate}>
          <label>
            {tr("Yêu cầu / user story", "Requirement / user story")}
            <textarea
              required
              minLength={10}
              maxLength={4000}
              rows={6}
              value={story}
              onChange={(e) => setStory(e.target.value)}
              placeholder={tr(
                "Ví dụ: Xây dựng chức năng đăng nhập gồm đăng ký, đăng nhập, reset mật khẩu và JWT.",
                "Example: Build authentication with registration, login, password reset and JWT.",
              )}
            />
          </label>
          <button
            type="submit"
            className="button primary full"
            disabled={
              busy ||
              documentBusy ||
              documentsLoading ||
              !project ||
              !documents.length
            }
          >
            {busy
              ? tr("ĐANG PHÂN TÍCH YÊU CẦU…", "ANALYZING REQUIREMENTS…")
              : tr("Phân rã yêu cầu công việc", "Decompose requirements")}
          </button>
          {busy && (
            <div className="editorial-loading-bar">
              <div className="editorial-loading-line" />
              <small>
                {tr(
                  "ĐANG ĐỐI CHIẾU TÀI LIỆU VÀ PHÂN RÃ CÔNG VIỆC…",
                  "ANALYZING DOCUMENTS & DECOMPOSING WORK…",
                )}
              </small>
            </div>
          )}
        </form>
      </div>
      {plan && (
        <div className="panel ai-preview">
          <div className="panel-header">
            <div>
              <span className="eyebrow">
                {tr("BẢN NHÁP · CHƯA LƯU", "DRAFT · NOT SAVED")}
              </span>
              <h3>{tr("Kế hoạch đề xuất", "Suggested plan")}</h3>
              <p className="muted">{plan.summary}</p>
            </div>
            <span className="badge">{plan.tasks.length} tasks</span>
          </div>
          <div className="ai-task-list">
            {plan.tasks.map((task, i) => (
              <div className="ai-task" key={task.localId}>
                <div className="ai-task-head">
                  <span className="number">
                    DRAFT № {String(i + 1).padStart(2, "0")}
                  </span>
                  <input
                    aria-label={tr("Tên công việc", "Task title")}
                    value={task.title}
                    onChange={(e) => edit(i, "title", e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    title={tr("Bỏ công việc", "Remove task")}
                    onClick={() =>
                      setPlan({
                        ...plan,
                        tasks: plan.tasks.filter((_, j) => j !== i),
                      })
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
                <textarea
                  aria-label={tr("Mô tả", "Description")}
                  rows={2}
                  value={task.description}
                  onChange={(e) => edit(i, "description", e.target.value)}
                />
                <div className="ai-task-foot">
                  <label>
                    {tr("Ước lượng", "Estimate")}{" "}
                    <input
                      type="number"
                      min="0"
                      step="0.25"
                      value={task.estimated_hours}
                      onChange={(e) =>
                        edit(i, "estimated_hours", Number(e.target.value))
                      }
                    />{" "}
                    {tr("giờ", "hours")}
                  </label>
                  <label>
                    {tr("Ưu tiên", "Priority")}{" "}
                    <select
                      value={task.priority}
                      onChange={(e) => edit(i, "priority", e.target.value)}
                    >
                      {["LOW", "MEDIUM", "HIGH", "URGENT"].map((p) => (
                        <option key={p} value={p}>
                          {enumLabel(p, language)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span>{task.required_skills.join(" · ")}</span>
                  <span>
                    {task.subtasks.length} {tr("công việc con", "subtasks")}
                  </span>
                </div>
                <label className="ai-skills">
                  {tr(
                    "Kỹ năng cần thiết (phân cách bằng dấu phẩy)",
                    "Required skills (comma separated)",
                  )}
                  <input
                    value={task.required_skills.join(", ")}
                    onChange={(e) => editSkills(i, e.target.value)}
                  />
                </label>
                <div className="ai-subtasks">
                  {task.subtasks.map((child, j) => (
                    <div key={child.localId}>
                      <input
                        aria-label={tr("Tên công việc con", "Subtask title")}
                        value={child.title}
                        onChange={(e) =>
                          editSubtask(i, j, "title", e.target.value)
                        }
                      />
                      <input
                        aria-label={tr("Giờ công việc con", "Subtask hours")}
                        type="number"
                        min="0"
                        step="0.25"
                        value={child.estimated_hours}
                        onChange={(e) =>
                          editSubtask(
                            i,
                            j,
                            "estimated_hours",
                            Number(e.target.value),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="icon-button"
                        onClick={() => removeSubtask(i, j)}
                        title={tr("Bỏ công việc con", "Remove subtask")}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="ai-task-actions">
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => addSubtask(i)}
                  >
                    + {tr("Công việc con", "Subtask")}
                  </button>
                  <button
                    type="button"
                    className="button subtle"
                    onClick={() => suggest(i)}
                  >
                    {tr("Gợi ý thành viên", "Suggest members")}
                  </button>
                </div>
                {suggestions[task.localId] && (
                  <div className="suggestions">
                    {suggestions[task.localId].slice(0, 5).map((s) => (
                      <div key={s.user_id}>
                        <strong>{s.name}</strong>
                        <span>
                          {tr("Kỹ năng", "Skill match")} {s.skill_match}% ·{" "}
                          {tr("Khối lượng", "Workload")}{" "}
                          {s.workload_percent ?? "—"}%{" "}
                          {s.overloaded ? tr("· Quá tải", "· Overloaded") : ""}
                        </span>
                      </div>
                    ))}
                    {!suggestions[task.localId].length && (
                      <p>
                        {tr(
                          "Chưa có thành viên phù hợp.",
                          "No matching members.",
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            className="button subtle"
            onClick={addTask}
            disabled={plan.tasks.length >= 20}
          >
            + {tr("Thêm công việc", "Add task")}
          </button>
          <div className="drawer-actions">
            <button
              type="button"
              className="button primary"
              onClick={confirm}
              disabled={busy || !plan.tasks.length}
            >
              {tr(
                "Nhập các tác vụ đã duyệt vào dự án",
                "Import approved tasks into project",
              )}{" "}
              [{String(plan.tasks.length).padStart(2, "0")}]
            </button>
            <button
              type="button"
              className="button subtle"
              onClick={() => setPlan(null)}
            >
              {tr("Hủy bản nháp", "Discard draft")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
