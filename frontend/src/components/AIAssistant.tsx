"use client";
import { useEffect, useState } from "react";
import { BookOpen, FileText, Trash2, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { enumLabel, useLanguage } from "@/lib/language";
import type { AIPlan, Project, ProjectDocument } from "@/lib/types";
type Suggestion = {
  user_id: number;
  name: string;
  skill_match: number;
  workload_percent: number | null;
  overloaded: boolean;
};
const aiErrorsVi: Record<string, string> = {
  "Project already has the maximum of 3 documents":
    "Dự án đã có tối đa 3 tài liệu.",
  "Document is empty": "Tài liệu trống.",
  "Document exceeds the 8 MB limit": "Tài liệu vượt giới hạn 8 MB.",
  "Invalid PDF file": "Tệp PDF không hợp lệ.",
  "PDF must be readable, unencrypted, and at most 100 pages":
    "PDF phải đọc được, không mã hóa và tối đa 100 trang.",
  "Invalid or oversized DOCX file": "Tệp DOCX không hợp lệ hoặc quá lớn.",
  "Text files must use UTF-8": "Tệp văn bản phải dùng UTF-8.",
  "Supported files: PDF, DOCX, TXT, MD": "Chỉ hỗ trợ PDF, DOCX, TXT và MD.",
  "Document contains no readable text": "Tài liệu không có văn bản đọc được.",
  "Document text exceeds the 100,000 character limit":
    "Văn bản vượt giới hạn 100.000 ký tự.",
  "Upload a project document before asking AI":
    "Hãy tải tài liệu của dự án lên trước khi hỏi AI.",
  "Only the uploader or a manager may remove this document":
    "Chỉ người tải lên hoặc quản lý được xóa tài liệu này.",
  "Gemini API key is not configured": "Chưa cấu hình khóa Gemini API.",
  "Gemini API key was rejected": "Khóa Gemini API bị từ chối.",
  "Gemini rate limit or quota reached; please retry later":
    "Gemini đã đạt giới hạn lượt gọi; hãy thử lại sau.",
  "Gemini is temporarily unavailable; please retry":
    "Gemini tạm thời không khả dụng; hãy thử lại.",
  "Gemini timed out": "Gemini hết thời gian chờ; hãy thử lại.",
  "Gemini rejected the request": "Gemini từ chối yêu cầu.",
  "Gemini returned an invalid response; please retry":
    "Gemini trả kết quả không hợp lệ; hãy thử lại.",
  "Gemini returned an invalid plan; please retry":
    "Gemini trả kế hoạch không hợp lệ; hãy thử lại.",
};
function aiError(message: string, language: "vi" | "en") {
  if (language === "en") return message;
  if (
    message.startsWith("Gemini model '") &&
    message.endsWith(" is unavailable; update GEMINI_MODEL")
  )
    return "Model Gemini không khả dụng; hãy cập nhật GEMINI_MODEL.";
  return aiErrorsVi[message] || message;
}
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
  const { language, t: tr } = useLanguage();
  const [story, setStory] = useState("");
  const [plan, setPlan] = useState<AIPlan | null>(null);
  const [requestId, setRequestId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [documentBusy, setDocumentBusy] = useState(false);
  useEffect(() => {
    setDocuments([]);
    setPlan(null);
    setAnswer("");
    setError("");
    if (!project) return;
    let active = true;
    api
      .get<ProjectDocument[]>(`/ai/projects/${project.id}/documents`)
      .then((rows) => {
        if (active) setDocuments(rows);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [project?.id]);
  async function upload(file: File | undefined) {
    if (!project || !file) return;
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
    if (!project || !documents.length || (mode === "ask" && !question.trim()))
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
  const [suggestions, setSuggestions] = useState<Record<number, Suggestion[]>>(
    {},
  );
  async function generate(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    setBusy(true);
    setError("");
    try {
      const data = await api.post<{ request_id: number; plan: AIPlan }>(
        "/ai/decompose-task",
        { project_id: project.id, story, language },
      );
      setPlan(data.plan);
      setSuggestions({});
      setRequestId(data.request_id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!requestId || !plan) return;
    setBusy(true);
    try {
      await api.post(`/ai/requests/${requestId}/confirm`, { plan });
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
    try {
      const skills = encodeURIComponent(
        plan.tasks[index].required_skills.join(","),
      );
      const rows = await api.get<Suggestion[]>(
        `/ai/projects/${project.id}/suggest-members?skills=${skills}`,
      );
      setSuggestions((current) => ({ ...current, [index]: rows }));
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
          {aiError(error, language)}
        </div>
      )}
      <div className="panel ai-form">
        <label>
          {tr("Dự án", "Project")}
          <select
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
                disabled={documentBusy}
                onClick={() => removeDocument(document.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {!documents.length && (
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
            disabled={!project || documentBusy || documents.length >= 3}
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
          disabled={busy || !documents.length}
          onClick={() => query("analyze")}
        >
          {tr("Phân tích dự án và hướng dẫn", "Analyze project and guide me")}
        </button>
        <label style={{ display: "block", marginTop: 16 }}>
          {tr("Câu hỏi về dự án", "Question about the project")}
          <textarea
            rows={3}
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
          disabled={busy || !documents.length || !question.trim()}
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
            className="button primary full"
            disabled={busy || !project || !documents.length}
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
              <div className="ai-task" key={i}>
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
                    <div key={j}>
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
                    className="button subtle"
                    onClick={() => addSubtask(i)}
                  >
                    + {tr("Công việc con", "Subtask")}
                  </button>
                  <button className="button subtle" onClick={() => suggest(i)}>
                    {tr("Gợi ý thành viên", "Suggest members")}
                  </button>
                </div>
                {suggestions[i] && (
                  <div className="suggestions">
                    {suggestions[i].slice(0, 5).map((s) => (
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
                    {!suggestions[i].length && (
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
            className="button subtle"
            onClick={addTask}
            disabled={plan.tasks.length >= 20}
          >
            + {tr("Thêm công việc", "Add task")}
          </button>
          <div className="drawer-actions">
            <button
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
            <button className="button subtle" onClick={() => setPlan(null)}>
              {tr("Hủy bản nháp", "Discard draft")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
