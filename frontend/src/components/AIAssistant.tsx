"use client";
import { useEffect, useRef, useState } from "react";
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
type AIUsage = {
  provider_calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
};
type AIContext = {
  context_id: number | null;
  turns: { id: number; question: string; answer: string }[];
};
type AIAnswer = {
  answer: string;
  context_id: number;
  cached: boolean;
  usage: AIUsage;
};
type AIProposal = {
  request_id: number;
  plan: AIPlan;
  eligible_members: { user_id: number; name: string }[];
  cached: boolean;
  usage: AIUsage;
  context_turns: number;
};
export default function AIAssistant({
  project,
  projects,
  onSelectProject,
  onCreated,
}: {
  project: Project | null;
  projects: Project[];
  onSelectProject: (duAn: Project) => void;
  onCreated: () => void;
}) {
  const { language, t: tr, message: messageText } = useLanguage();
  const [yeuCauLapKeHoach, datYeuCauLapKeHoach] = useState("");
  const [keHoach, datKeHoach] = useState<DraftPlan | null>(null);
  const [maYeuCau, datMaYeuCau] = useState<number | null>(null);
  const [dangXuLy, datDangXuLy] = useState(false);
  const [loiHienThi, datLoiHienThi] = useState("");
  const [danhSachTaiLieu, datDanhSachTaiLieu] = useState<ProjectDocument[]>([]);
  const [cauHoi, datCauHoi] = useState("");
  const [cauTraLoi, datCauTraLoi] = useState("");
  const [maNguCanh, datMaNguCanh] = useState<number | null>(null);
  const [dungNguCanh, datDungNguCanh] = useState(true);
  const [thanhVienCoQuyen, datThanhVienCoQuyen] = useState<
    AIProposal["eligible_members"]
  >([]);
  const [luongToken, datLuongToken] = useState<AIUsage | null>(null);
  const [layTuCache, datLayTuCache] = useState(false);
  // Mỗi dự án/ngôn ngữ là một phiên; bỏ phản hồi đến muộn của phiên cũ.
  const phienDuAn = useRef(0);
  const [dangXuLyTaiLieu, datDangXuLyTaiLieu] = useState(false);
  const [dangTaiTaiLieu, datDangTaiTaiLieu] = useState(false);
  const maDuAn = project?.id;
  useEffect(() => {
    phienDuAn.current += 1;
    datDangXuLy(false);
    datDangXuLyTaiLieu(false);
    datMaNguCanh(null);
    datDungNguCanh(true);
    datLuongToken(null);
    datThanhVienCoQuyen([]);
    datDanhSachTaiLieu([]);
    datKeHoach(null);
    datMaYeuCau(null);
    datDanhSachGoiY({});
    datYeuCauLapKeHoach("");
    datCauHoi("");
    datCauTraLoi("");
    datLoiHienThi("");
    if (!maDuAn) return;
    datDangTaiTaiLieu(true);
    let conHieuLuc = true;
    Promise.all([
      api.get<ProjectDocument[]>(`/ai/projects/${maDuAn}/documents`),
      api.get<AIContext>(`/ai/projects/${maDuAn}/context?language=${language}`),
    ])
      .then(([taiLieu, hoiThoai]) => {
        if (conHieuLuc) {
          datDanhSachTaiLieu(taiLieu);
          datMaNguCanh(hoiThoai.context_id);
          datCauTraLoi(hoiThoai.turns.at(-1)?.answer || "");
        }
      })
      .catch((loi) => {
        if (conHieuLuc) datLoiHienThi(loi.message);
      })
      .finally(() => {
        if (conHieuLuc) datDangTaiTaiLieu(false);
      });
    return () => {
      conHieuLuc = false;
    };
  }, [maDuAn, language]);
  async function taiTaiLieuLen(tepTaiLieu: File | undefined) {
    if (
      !project ||
      !tepTaiLieu ||
      dangXuLy ||
      dangXuLyTaiLieu ||
      dangTaiTaiLieu
    )
      return;
    datDangXuLyTaiLieu(true);
    datLoiHienThi("");
    const lanYeuCau = phienDuAn.current;
    try {
      const taiLieu = await api.upload<ProjectDocument>(
        `/ai/projects/${project.id}/documents`,
        tepTaiLieu,
      );
      if (phienDuAn.current !== lanYeuCau) return;
      datDanhSachTaiLieu((giaTriHienTai) => [...giaTriHienTai, taiLieu]);
      datKeHoach(null);
      datCauTraLoi("");
      datMaNguCanh(null);
      datLuongToken(null);
      datMaYeuCau(null);
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    } finally {
      if (phienDuAn.current === lanYeuCau) datDangXuLyTaiLieu(false);
    }
  }
  async function xoaTaiLieu(id: number) {
    if (dangXuLy || dangXuLyTaiLieu) return;
    datDangXuLyTaiLieu(true);
    datLoiHienThi("");
    const lanYeuCau = phienDuAn.current;
    try {
      await api.delete(`/ai/documents/${id}`);
      if (phienDuAn.current !== lanYeuCau) return;
      datDanhSachTaiLieu((giaTriHienTai) =>
        giaTriHienTai.filter((taiLieu) => taiLieu.id !== id),
      );
      datKeHoach(null);
      datCauTraLoi("");
      datMaNguCanh(null);
      datLuongToken(null);
      datMaYeuCau(null);
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    } finally {
      if (phienDuAn.current === lanYeuCau) datDangXuLyTaiLieu(false);
    }
  }
  async function hoiAI(mode: "analyze" | "ask") {
    if (
      !project ||
      dangXuLy ||
      dangXuLyTaiLieu ||
      dangTaiTaiLieu ||
      !danhSachTaiLieu.length ||
      (mode === "ask" && !cauHoi.trim())
    )
      return;
    datDangXuLy(true);
    datLoiHienThi("");
    const lanYeuCau = phienDuAn.current;
    try {
      const ketQua = await api.post<AIAnswer>(
        `/ai/projects/${project.id}/query`,
        {
          mode,
          question: mode === "ask" ? cauHoi.trim() : "",
          language,
          context_id: mode === "ask" ? maNguCanh : null,
        },
      );
      if (phienDuAn.current !== lanYeuCau) return;
      datCauTraLoi(ketQua.answer);
      datMaNguCanh(ketQua.context_id);
      datDungNguCanh(true);
      datKeHoach(null);
      datMaYeuCau(null);
      datLuongToken(ketQua.usage);
      datLayTuCache(ketQua.cached);
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    } finally {
      if (phienDuAn.current === lanYeuCau) datDangXuLy(false);
    }
  }
  const [danhSachGoiY, datDanhSachGoiY] = useState<
    Record<string, Suggestion[]>
  >({});
  async function lapKeHoach(suKien?: React.FormEvent, dungCauTraLoi = false) {
    suKien?.preventDefault();
    if (
      !project ||
      dangXuLy ||
      dangXuLyTaiLieu ||
      dangTaiTaiLieu ||
      !danhSachTaiLieu.length
    )
      return;
    datDangXuLy(true);
    datLoiHienThi("");
    const lanYeuCau = phienDuAn.current;
    try {
      const ketQua = await api.post<AIProposal>("/ai/decompose-task", {
        project_id: project.id,
        story: yeuCauLapKeHoach,
        language,
        context_id: dungCauTraLoi || dungNguCanh ? maNguCanh : null,
      });
      if (phienDuAn.current !== lanYeuCau) return;
      datKeHoach(toDraft(ketQua.plan));
      datDanhSachGoiY({});
      datMaYeuCau(ketQua.request_id);
      datThanhVienCoQuyen(ketQua.eligible_members);
      datLuongToken(ketQua.usage);
      datLayTuCache(ketQua.cached);
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    } finally {
      if (phienDuAn.current === lanYeuCau) datDangXuLy(false);
    }
  }
  async function xacNhanKeHoach() {
    if (!maYeuCau || !keHoach || dangXuLy) return;
    datLoiHienThi("");
    datDangXuLy(true);
    const lanYeuCau = phienDuAn.current;
    try {
      await api.post(`/ai/requests/${maYeuCau}/confirm`, {
        plan: toPlan(keHoach),
      });
      if (phienDuAn.current !== lanYeuCau) return;
      datKeHoach(null);
      datMaYeuCau(null);
      onCreated();
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    } finally {
      if (phienDuAn.current === lanYeuCau) datDangXuLy(false);
    }
  }
  function suaCongViec(
    viTriCongViec: number,
    tenTruong: string,
    giaTri: string | number | null,
  ) {
    if (!keHoach) return;
    // Tạo mảng mới để React biết bản nháp đã đổi; giữ nguyên các việc còn lại.
    const congViecDaSua = keHoach.tasks.map((congViec, viTri) => {
      if (viTri !== viTriCongViec) return congViec;

      const banMoi = { ...congViec, [tenTruong]: giaTri };
      if (tenTruong === "assignee_id") banMoi.assignment_reason = "";
      return banMoi;
    });
    datKeHoach({
      ...keHoach,
      tasks: congViecDaSua,
    });
  }
  function suaKyNang(viTriCongViec: number, giaTri: string) {
    if (!keHoach) return;
    const danhSachKyNang = giaTri
      .split(",")
      .map((tenKyNang) => tenKyNang.trim())
      .filter((tenKyNang) => tenKyNang !== "")
      .slice(0, 12);
    datKeHoach({
      ...keHoach,
      tasks: keHoach.tasks.map((congViec, viTri) => {
        if (viTri !== viTriCongViec) return congViec;
        return { ...congViec, required_skills: danhSachKyNang };
      }),
    });
  }
  function suaViecCon(
    viTriCongViec: number,
    viTriViecCon: number,
    tenTruong: string,
    giaTri: string | number,
  ) {
    if (!keHoach) return;
    datKeHoach({
      ...keHoach,
      tasks: keHoach.tasks.map((congViec, viTri) => {
        if (viTri !== viTriCongViec) return congViec;
        const viecConDaSua = congViec.subtasks.map((viecCon, viTriCon) => {
          if (viTriCon !== viTriViecCon) return viecCon;
          return { ...viecCon, [tenTruong]: giaTri };
        });
        return { ...congViec, subtasks: viecConDaSua };
      }),
    });
  }
  function themViecCon(viTriCongViec: number) {
    if (!keHoach) return;
    datKeHoach({
      ...keHoach,
      tasks: keHoach.tasks.map((congViec, viTri) => {
        if (viTri !== viTriCongViec || congViec.subtasks.length >= 15) {
          return congViec;
        }
        const viecConMoi = {
          localId: crypto.randomUUID(),
          title: tr("Công việc con mới", "New subtask"),
          description: "",
          estimated_hours: 0,
        };
        return { ...congViec, subtasks: [...congViec.subtasks, viecConMoi] };
      }),
    });
  }
  function xoaViecCon(viTriCongViec: number, viTriViecCon: number) {
    if (!keHoach) return;
    datKeHoach({
      ...keHoach,
      tasks: keHoach.tasks.map((congViec, viTri) => {
        if (viTri !== viTriCongViec) return congViec;
        const viecConConLai = congViec.subtasks.filter(
          (_, viTriCon) => viTriCon !== viTriViecCon,
        );
        return { ...congViec, subtasks: viecConConLai };
      }),
    });
  }
  function themCongViec() {
    if (!keHoach || keHoach.tasks.length >= 20) return;
    datKeHoach({
      ...keHoach,
      tasks: [
        ...keHoach.tasks,
        {
          localId: crypto.randomUUID(),
          title: tr("Công việc mới", "New task"),
          description: "",
          estimated_hours: 0,
          priority: "MEDIUM",
          required_skills: [],
          assignee_id: null,
          subtasks: [],
        },
      ],
    });
  }
  async function goiYNguoiNhan(viTriCongViec: number) {
    if (!project || !keHoach) return;
    const maBanNhap = keHoach.tasks[viTriCongViec].localId;
    const lanYeuCau = phienDuAn.current;
    try {
      const chuoiKyNang = encodeURIComponent(
        keHoach.tasks[viTriCongViec].required_skills.join(","),
      );
      const thanhVienDeXuat = await api.get<Suggestion[]>(
        `/ai/projects/${project.id}/suggest-members?skills=${chuoiKyNang}`,
      );
      if (phienDuAn.current === lanYeuCau)
        datDanhSachGoiY((giaTriHienTai) => ({
          ...giaTriHienTai,
          [maBanNhap]: thanhVienDeXuat,
        }));
    } catch (loi) {
      if (phienDuAn.current === lanYeuCau)
        datLoiHienThi((loi as Error).message);
    }
  }
  return (
    <div className="ai-layout">
      <div className="ai-intro">
        <div className="ai-icon">
          <BookOpen size={26} />
        </div>
        <span className="eyebrow">
          {tr("Trợ lý dự án", "Project assistant")}
        </span>
        <h2>
          {tr(
            "Hiểu tài liệu và lập kế hoạch dự án",
            "Understand documents and plan your project",
          )}
        </h2>
        <p>
          {tr(
            "Tải tài liệu lên, trao đổi với AI rồi tạo kế hoạch từ câu trả lời. Hệ thống đề xuất người nhận; bạn kiểm tra, chỉnh sửa và xác nhận.",
            "Upload documents, discuss with AI, then turn its answer into a plan. Review suggested assignees, edit and confirm.",
          )}
        </p>
        <div className="ai-steps">
          <span>{tr("01 · Tải tài liệu", "01 · Upload documents")}</span>
          <span>{tr("02 · Hỏi hoặc phân tích", "02 · Ask or analyze")}</span>
          <span>{tr("03 · Duyệt và giao việc", "03 · Review and assign")}</span>
        </div>
      </div>
      {loiHienThi && (
        <div className="error" role="alert">
          {messageText(loiHienThi)}
        </div>
      )}
      <div className="panel ai-form">
        <label>
          {tr("Dự án", "Project")}
          <select
            disabled={dangXuLy || dangXuLyTaiLieu}
            value={project?.id || ""}
            onChange={(suKien) => {
              const duAnDuocChon = projects.find(
                (duAn) => duAn.id === Number(suKien.target.value),
              );
              if (duAnDuocChon) onSelectProject(duAnDuocChon);
            }}
          >
            {!project && (
              <option value="">{tr("Chọn dự án", "Select a project")}</option>
            )}
            {projects.map((duAn) => (
              <option key={duAn.id} value={duAn.id}>
                {duAn.name}
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
          {danhSachTaiLieu.map((taiLieu) => (
            <div className="document-row" key={taiLieu.id}>
              <FileText size={18} />
              <span>{taiLieu.filename}</span>
              <small>{(taiLieu.size_bytes / 1024).toFixed(0)} KB</small>
              <button
                className="icon-button"
                type="button"
                title={tr("Xóa tài liệu", "Delete document")}
                disabled={dangXuLy || dangXuLyTaiLieu || dangTaiTaiLieu}
                onClick={() => xoaTaiLieu(taiLieu.id)}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {dangTaiTaiLieu && (
            <p className="muted">
              {tr("Đang tải tài liệu…", "Loading documents…")}
            </p>
          )}
          {!dangTaiTaiLieu && !danhSachTaiLieu.length && (
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
          {dangXuLyTaiLieu
            ? tr("Đang tải lên…", "Uploading…")
            : tr("Tải tài liệu lên", "Upload document")}
          <input
            type="file"
            accept=".pdf,.docx,.txt,.md"
            style={{ display: "none" }}
            disabled={
              !project ||
              dangXuLy ||
              dangXuLyTaiLieu ||
              dangTaiTaiLieu ||
              danhSachTaiLieu.length >= 3
            }
            onChange={(suKien) => {
              const tepTaiLieu = suKien.target.files?.[0];
              void taiTaiLieuLen(tepTaiLieu);
              suKien.target.value = "";
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
            dangXuLy ||
            dangXuLyTaiLieu ||
            dangTaiTaiLieu ||
            !danhSachTaiLieu.length
          }
          onClick={() => hoiAI("analyze")}
        >
          {tr("Phân tích dự án và hướng dẫn", "Analyze project and guide me")}
        </button>
        <label style={{ display: "block", marginTop: 16 }}>
          {tr("Câu hỏi về dự án", "Question about the project")}
          <textarea
            rows={3}
            maxLength={2000}
            value={cauHoi}
            onChange={(suKien) => datCauHoi(suKien.target.value)}
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
            dangXuLy ||
            dangXuLyTaiLieu ||
            dangTaiTaiLieu ||
            !danhSachTaiLieu.length ||
            !cauHoi.trim()
          }
          onClick={() => hoiAI("ask")}
        >
          {dangXuLy
            ? tr("Đang xử lý…", "Working…")
            : tr("Hỏi Gemini", "Ask Gemini")}
        </button>
        {cauTraLoi && (
          <div className="ai-answer" aria-live="polite">
            <h4>{tr("Câu trả lời", "Answer")}</h4>
            <div>{cauTraLoi}</div>
            <button
              type="button"
              className="button primary"
              style={{ marginTop: 16, whiteSpace: "normal" }}
              disabled={
                dangXuLy || dangXuLyTaiLieu || !maNguCanh || dangTaiTaiLieu
              }
              onClick={() => void lapKeHoach(undefined, true)}
            >
              {tr(
                "Lập kế hoạch và phân công từ câu trả lời này",
                "Plan and assign from this answer",
              )}
            </button>
          </div>
        )}
      </div>
      <div className="panel ai-form">
        <h3>{tr("Lập kế hoạch và phân công", "Plan and assign work")}</h3>
        {maNguCanh && (
          <label className="ai-context-toggle">
            <input
              type="checkbox"
              checked={dungNguCanh}
              disabled={dangXuLy}
              onChange={(suKien) => datDungNguCanh(suKien.target.checked)}
            />
            {tr(
              "Dùng câu trả lời và trao đổi gần đây",
              "Use the answer and recent conversation",
            )}
          </label>
        )}
        <p className="muted">
          {tr(
            "Người nhận được đề xuất theo kỹ năng và tải công việc, có tính cả các việc trong bản nháp. Bạn có thể đổi trước khi lưu.",
            "Assignees are suggested using skills and workload, including tasks in this draft. You can change them before saving.",
          )}
        </p>
        <form onSubmit={lapKeHoach}>
          <label>
            {maNguCanh && dungNguCanh
              ? tr(
                  "Yêu cầu bổ sung (không bắt buộc)",
                  "Additional instructions (optional)",
                )
              : tr("Yêu cầu / user story", "Requirement / user story")}
            <textarea
              required={!maNguCanh || !dungNguCanh}
              minLength={maNguCanh && dungNguCanh ? undefined : 10}
              maxLength={4000}
              rows={3}
              disabled={dangXuLy}
              value={yeuCauLapKeHoach}
              onChange={(suKien) => datYeuCauLapKeHoach(suKien.target.value)}
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
              dangXuLy ||
              dangXuLyTaiLieu ||
              dangTaiTaiLieu ||
              !project ||
              !danhSachTaiLieu.length
            }
          >
            {dangXuLy
              ? tr("Đang xử lý…", "Working…")
              : tr(
                  "Tạo bản nháp và đề xuất người nhận",
                  "Draft tasks and suggest assignees",
                )}
          </button>
          {dangXuLy && (
            <div className="editorial-loading-bar">
              <div className="editorial-loading-line" />
              <small>
                {tr(
                  "AI đang xử lý yêu cầu của bạn…",
                  "AI is processing your request…",
                )}
              </small>
            </div>
          )}
        </form>
      </div>
      {luongToken && (
        <details className="ai-usage">
          <summary>
            {layTuCache
              ? tr(
                  "Đã dùng kết quả lưu · không gọi AI lại",
                  "Saved result · no new AI call",
                )
              : tr(
                  "Thông số kết quả AI gần nhất",
                  "Usage for the latest AI result",
                )}
          </summary>
          <p>
            {tr("Lượt gọi", "Provider calls")}:{" "}
            {luongToken.provider_calls ?? "—"} ·{" "}
            {tr("Token đầu vào", "Input tokens")}:{" "}
            {luongToken.input_tokens ?? (layTuCache ? 0 : "—")} ·{" "}
            {tr("Tổng token", "Total tokens")}: {luongToken.total_tokens ?? "—"}
          </p>
        </details>
      )}
      {keHoach && (
        <div className="panel ai-preview">
          <fieldset disabled={dangXuLy} className="ai-draft-fields">
            <div className="panel-header">
              <div>
                <span className="eyebrow">
                  {tr("BẢN NHÁP · CHƯA LƯU", "DRAFT · NOT SAVED")}
                </span>
                <h3>{tr("Kế hoạch đề xuất", "Suggested plan")}</h3>
                <p className="muted">{keHoach.summary}</p>
              </div>
              <span className="badge">
                {keHoach.tasks.length} {tr("công việc", "tasks")}
              </span>
            </div>
            <div className="ai-task-list">
              {keHoach.tasks.map((congViec, viTri) => (
                <div className="ai-task" key={congViec.localId}>
                  <div className="ai-task-head">
                    <span className="number">
                      {tr("Việc", "Task")} {String(viTri + 1).padStart(2, "0")}
                    </span>
                    <input
                      aria-label={tr("Tên công việc", "Task title")}
                      value={congViec.title}
                      onChange={(suKien) =>
                        suaCongViec(viTri, "title", suKien.target.value)
                      }
                    />
                    <button
                      type="button"
                      className="icon-button"
                      title={tr("Bỏ công việc", "Remove task")}
                      onClick={() =>
                        datKeHoach({
                          ...keHoach,
                          tasks: keHoach.tasks.filter(
                            (_, viTriCon) => viTriCon !== viTri,
                          ),
                        })
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <textarea
                    aria-label={tr("Mô tả", "Description")}
                    rows={2}
                    value={congViec.description}
                    onChange={(suKien) =>
                      suaCongViec(viTri, "description", suKien.target.value)
                    }
                  />
                  <div className="ai-task-foot">
                    <label>
                      {tr("Ước lượng", "Estimate")}{" "}
                      <input
                        type="number"
                        min="0"
                        step="0.25"
                        value={congViec.estimated_hours}
                        onChange={(suKien) =>
                          suaCongViec(
                            viTri,
                            "estimated_hours",
                            Number(suKien.target.value),
                          )
                        }
                      />{" "}
                      {tr("giờ", "hours")}
                    </label>
                    <label>
                      {tr("Ưu tiên", "Priority")}{" "}
                      <select
                        value={congViec.priority}
                        onChange={(suKien) =>
                          suaCongViec(viTri, "priority", suKien.target.value)
                        }
                      >
                        {["LOW", "MEDIUM", "HIGH", "URGENT"].map(
                          (mucUuTien) => (
                            <option key={mucUuTien} value={mucUuTien}>
                              {enumLabel(mucUuTien, language)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <span>{congViec.required_skills.join(" · ")}</span>
                    <span>
                      {congViec.subtasks.length}{" "}
                      {tr("công việc con", "subtasks")}
                    </span>
                  </div>
                  <label className="ai-assignment">
                    {tr("Người thực hiện", "Assignee")}
                    <select
                      aria-label={tr("Người thực hiện", "Assignee")}
                      value={congViec.assignee_id ?? ""}
                      onChange={(suKien) =>
                        suaCongViec(
                          viTri,
                          "assignee_id",
                          suKien.target.value
                            ? Number(suKien.target.value)
                            : null,
                        )
                      }
                    >
                      <option value="">{tr("Chưa giao", "Unassigned")}</option>
                      {thanhVienCoQuyen.map((thanhVien) => (
                        <option
                          key={thanhVien.user_id}
                          value={thanhVien.user_id}
                        >
                          {thanhVien.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {congViec.assignment_reason && (
                    <p className="muted ai-assignment-reason">
                      {tr("Đề xuất ban đầu: ", "Initial suggestion: ")}
                      {congViec.assignment_reason}
                    </p>
                  )}
                  <label className="ai-skills">
                    {tr(
                      "Kỹ năng cần thiết (phân cách bằng dấu phẩy)",
                      "Required skills (comma separated)",
                    )}
                    <input
                      value={congViec.required_skills.join(", ")}
                      onChange={(suKien) =>
                        suaKyNang(viTri, suKien.target.value)
                      }
                    />
                  </label>
                  <div className="ai-subtasks">
                    {congViec.subtasks.map((viecCon, viTriCon) => (
                      <div key={viecCon.localId}>
                        <input
                          aria-label={tr("Tên công việc con", "Subtask title")}
                          value={viecCon.title}
                          onChange={(suKien) =>
                            suaViecCon(
                              viTri,
                              viTriCon,
                              "title",
                              suKien.target.value,
                            )
                          }
                        />
                        <input
                          aria-label={tr("Giờ công việc con", "Subtask hours")}
                          type="number"
                          min="0"
                          step="0.25"
                          value={viecCon.estimated_hours}
                          onChange={(suKien) =>
                            suaViecCon(
                              viTri,
                              viTriCon,
                              "estimated_hours",
                              Number(suKien.target.value),
                            )
                          }
                        />
                        <button
                          type="button"
                          className="icon-button"
                          onClick={() => xoaViecCon(viTri, viTriCon)}
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
                      onClick={() => themViecCon(viTri)}
                    >
                      + {tr("Công việc con", "Subtask")}
                    </button>
                    <button
                      type="button"
                      className="button subtle"
                      onClick={() => goiYNguoiNhan(viTri)}
                    >
                      {tr("Gợi ý thành viên", "Suggest members")}
                    </button>
                  </div>
                  {danhSachGoiY[congViec.localId] && (
                    <div className="suggestions">
                      {danhSachGoiY[congViec.localId]
                        .slice(0, 5)
                        .map((viecCon) => (
                          <div key={viecCon.user_id}>
                            <strong>{viecCon.name}</strong>
                            <span>
                              {tr("Kỹ năng", "Skill match")}{" "}
                              {viecCon.skill_match}% ·{" "}
                              {tr("Khối lượng", "Workload")}{" "}
                              {viecCon.workload_percent ?? "—"}%{" "}
                              {viecCon.overloaded
                                ? tr("· Quá tải", "· Overloaded")
                                : ""}
                            </span>
                            <button
                              type="button"
                              className="button subtle"
                              onClick={() =>
                                suaCongViec(
                                  viTri,
                                  "assignee_id",
                                  viecCon.user_id,
                                )
                              }
                            >
                              {tr("Chọn", "Choose")}
                            </button>
                          </div>
                        ))}
                      {!danhSachGoiY[congViec.localId].length && (
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
              onClick={themCongViec}
              disabled={keHoach.tasks.length >= 20}
            >
              + {tr("Thêm công việc", "Add task")}
            </button>
            <div className="drawer-actions">
              <button
                type="button"
                className="button primary"
                onClick={xacNhanKeHoach}
                disabled={dangXuLy || !keHoach.tasks.length}
              >
                {tr("Xác nhận và giao việc", "Confirm and assign tasks")} [
                {String(keHoach.tasks.length).padStart(2, "0")}]
              </button>
              <button
                type="button"
                className="button subtle"
                onClick={() => datKeHoach(null)}
              >
                {tr("Hủy bản nháp", "Discard draft")}
              </button>
            </div>
          </fieldset>
        </div>
      )}
    </div>
  );
}
