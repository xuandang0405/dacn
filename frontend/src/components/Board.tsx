"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, Clock3, Plus, Settings2, X } from "lucide-react";
import { api, ApiError, createTask } from "@/lib/api";
import { listenForChanges } from "@/lib/realtime";
import AssignmentWarning from "./AssignmentWarning";
import { enumLabel, useLanguage } from "@/lib/language";
import { formatTimestamp } from "@/lib/dates";
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
  version: number;
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
  projects,
  initialTaskId,
  onSelectProject,
  workspace,
  actorId,
  onProjectChange,
  onDeleted,
}: {
  project: Project;
  projects: Project[];
  initialTaskId: number | null;
  onSelectProject: (project: Project) => void;
  workspace: Workspace;
  actorId: number;
  onProjectChange: (p: Project) => void;
  onDeleted: () => void;
}) {
  const { language, t: tr, message: messageText } = useLanguage();
  const [danhSachCot, datDanhSachCot] = useState<Column[]>([]);
  const [danhSachCongViec, datDanhSachCongViec] = useState<Task[]>([]);
  const [danhSachThanhVien, datDanhSachThanhVien] = useState<Member[]>([]);
  const [thanhVienDuAn, datThanhVienDuAn] = useState<number[]>([]);
  const [congViecDangChon, chonCongViec] = useState<Task | null>(null);
  const [tenCongViecMoi, datTenCongViecMoi] = useState("");
  const [nguoiNhanMoi, datNguoiNhanMoi] = useState(0);
  const [gioDuKienMoi, datGioDuKienMoi] = useState("");
  const [congViecVuaTao, datCongViecVuaTao] = useState<Task | null>(null);
  const [tenCotMoi, datTenCotMoi] = useState("");
  const [tuKhoa, datTuKhoa] = useState("");
  const [locUuTien, datLocUuTien] = useState("");
  const [locNguoiNhan, datLocNguoiNhan] = useState(0);
  const [loiHienThi, datLoiHienThi] = useState("");
  const [dangXuLy, datDangXuLy] = useState(false);
  const [dangTai, datDangTai] = useState(true);
  const [dangMoCaiDat, datMoCaiDat] = useState(false);
  const [tenDuAn, datTenDuAn] = useState(project.name);
  const [moTaDuAn, datMoTaDuAn] = useState(project.description);
  const [trangThaiDuAn, datTrangThaiDuAn] = useState(project.status);
  const [lanLamMoi, tangLanLamMoi] = useState(0);
  const lanTaiMoiNhat = useRef(0);
  const congViecDaMo = useRef<number | null>(null);
  const khiMatQuyenDuAn = useRef(onDeleted);
  useEffect(() => {
    khiMatQuyenDuAn.current = onDeleted;
  }, [onDeleted]);
  const vaiTro = danhSachThanhVien.find(
    (thanhVien) => thanhVien.user_id === actorId,
  )?.role;
  const coQuyenQuanLy = vaiTro === "OWNER" || vaiTro === "ADMIN";
  const thanhVienCoQuyen = danhSachThanhVien.filter(
    (thanhVien) =>
      thanhVien.role !== "MEMBER" || thanhVienDuAn.includes(thanhVien.user_id),
  );
  const taiDuLieu = useCallback(
    async (xoaLoiCu = true) => {
      const lanTaiHienTai = ++lanTaiMoiNhat.current;
      try {
        const [danhSachCot, danhSachThanhVien, thanhVienDuAn] =
          await Promise.all([
            api.get<Column[]>(`/projects/${project.id}/columns`),
            api.get<Member[]>(`/workspaces/${workspace.id}/members`),
            api.get<number[]>(`/projects/${project.id}/members`),
          ]);
        const danhSachCongViec: Task[] = [];
        let soTrang = 1;
        let tongCongViec = 0;
        do {
          const ketQua = await api.get<Paged<Task>>(
            `/projects/${project.id}/tasks?size=100&page=${soTrang}`,
          );
          danhSachCongViec.push(...ketQua.items);
          tongCongViec = ketQua.total;
          soTrang++;
          if (ketQua.items.length === 0) break;
        } while (danhSachCongViec.length < tongCongViec && soTrang < 100);
        // Bỏ kết quả cũ nếu một lượt tải mới hơn đã bắt đầu.
        if (lanTaiHienTai !== lanTaiMoiNhat.current) return;
        datDanhSachCot(danhSachCot);
        datDanhSachCongViec(danhSachCongViec);
        datDanhSachThanhVien(danhSachThanhVien);
        datThanhVienDuAn(thanhVienDuAn);
        chonCongViec((congViecDangMo) => {
          if (!congViecDangMo) return null;
          const vanConCongViec = danhSachCongViec.some(
            (congViec) => congViec.id === congViecDangMo.id,
          );
          if (!vanConCongViec) return null;
          return congViecDangMo;
        });
        if (xoaLoiCu) datLoiHienThi("");
      } catch (loi) {
        if (lanTaiHienTai === lanTaiMoiNhat.current)
          datLoiHienThi((loi as Error).message);
      } finally {
        if (lanTaiHienTai === lanTaiMoiNhat.current) datDangTai(false);
      }
    },
    [project.id, workspace.id],
  );
  useEffect(() => {
    taiDuLieu();
    return () => {
      lanTaiMoiNhat.current++;
    };
  }, [taiDuLieu]);
  useEffect(() => {
    if (dangTai || !initialTaskId || congViecDaMo.current === initialTaskId)
      return;
    const congViec = danhSachCongViec.find(
      (congViec) => congViec.id === initialTaskId,
    );
    if (congViec) {
      chonCongViec(congViec);
      congViecDaMo.current = initialTaskId;
    }
  }, [initialTaskId, danhSachCongViec, dangTai]);
  useEffect(() => {
    if (
      nguoiNhanMoi &&
      !thanhVienCoQuyen.some((thanhVien) => thanhVien.user_id === nguoiNhanMoi)
    )
      datNguoiNhanMoi(0);
  }, [nguoiNhanMoi, thanhVienCoQuyen]);
  useEffect(() => {
    let daDong = false;
    const dongKetNoi = listenForChanges({
      projectId: project.id,
      onChange: () => {
        tangLanLamMoi((value) => value + 1);
        taiDuLieu(false);
      },
      checkAccess: async () => {
        try {
          await api.get<Project>(`/projects/${project.id}`);
          return true;
        } catch (loi) {
          if (
            !daDong &&
            loi instanceof ApiError &&
            (loi.status === 403 || loi.status === 404)
          ) {
            khiMatQuyenDuAn.current();
          }
          return false;
        }
      },
    });
    return () => {
      daDong = true;
      dongKetNoi();
    };
  }, [project.id, taiDuLieu]);
  async function taoCongViec(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangXuLy) return;
    if (!tenCongViecMoi.trim()) {
      datLoiHienThi(tr("Vui lòng nhập tên công việc.", "Enter a task title."));
      return;
    }
    datLoiHienThi("");
    datDangXuLy(true);
    try {
      const daTao = await createTask<Task>(
        project.id,
        {
          title: tenCongViecMoi.trim(),
          description: "",
          priority: "MEDIUM",
          estimated_hours: Number(gioDuKienMoi),
          actual_hours: 0,
          assignee_id: nguoiNhanMoi || null,
        },
        actorId,
      );
      datTenCongViecMoi("");
      datGioDuKienMoi("");
      datCongViecVuaTao(daTao.assignee_id ? daTao : null);
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function chuyenCongViec(
    congViec: Task,
    column_id: number,
    position: number,
  ) {
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.post(`/tasks/${congViec.id}/move`, {
        column_id,
        position,
        version: congViec.version,
      });
      await taiDuLieu();
    } catch (loi) {
      await taiDuLieu(false);
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function themCot(suKien: React.FormEvent) {
    suKien.preventDefault();
    try {
      await api.post(`/projects/${project.id}/columns`, {
        name: tenCotMoi,
        is_done: false,
      });
      datTenCotMoi("");
      taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    }
  }
  async function themThanhVien(userId: number) {
    if (dangXuLy) return;
    datDangXuLy(true);
    datLoiHienThi("");
    try {
      await api.post(`/projects/${project.id}/members/${userId}`);
      taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function boThanhVien(userId: number) {
    if (
      dangXuLy ||
      !confirm(
        tr(
          "Bỏ thành viên khỏi dự án? Các công việc được giao sẽ trở về chưa phân công.",
          "Remove this project member? Their tasks will become unassigned.",
        ),
      )
    )
      return;
    datDangXuLy(true);
    datLoiHienThi("");
    try {
      await api.delete(`/projects/${project.id}/members/${userId}`);
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function luuDuAn(suKien: React.FormEvent) {
    suKien.preventDefault();
    try {
      const duAnDaLuu = await api.put<Project>(`/projects/${project.id}`, {
        name: tenDuAn,
        description: moTaDuAn,
        status: trangThaiDuAn,
        start_date: project.start_date || null,
        end_date: project.end_date || null,
      });
      onProjectChange(duAnDaLuu);
      datMoCaiDat(false);
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    }
  }
  async function xoaDuAn() {
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
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    }
  }
  const tuKhoaTim = tuKhoa.toLocaleLowerCase();
  const congViecHienThi = danhSachCongViec.filter((congViec) => {
    const noiDungTim =
      `${congViec.title} ${congViec.description}`.toLocaleLowerCase();
    if (tuKhoa && !noiDungTim.includes(tuKhoaTim)) return false;
    if (locUuTien && congViec.priority !== locUuTien) return false;
    if (locNguoiNhan === -1) return congViec.assignee_id === null;
    if (locNguoiNhan && congViec.assignee_id !== locNguoiNhan) return false;
    return true;
  });
  if (dangTai)
    return (
      <div
        className="skeleton-stack"
        role="status"
        aria-label={tr("Đang tải công việc", "Loading tasks")}
      >
        <div />
        <div />
        <div />
      </div>
    );
  return (
    <>
      <div className="board-context">
        <label htmlFor="board-project">
          {tr("Dự án đang mở", "Current project")}
        </label>
        <select
          id="board-project"
          value={project.id}
          onChange={(event) => {
            const next = projects.find(
              (congViec) => congViec.id === Number(event.target.value),
            );
            if (next) onSelectProject(next);
          }}
        >
          {projects.map((congViec) => (
            <option key={congViec.id} value={congViec.id}>
              {congViec.name}
            </option>
          ))}
        </select>
      </div>
      <div className="board-header">
        <div>
          <div className="eyebrow">{enumLabel(project.status, language)}</div>
          <h2>{project.name}</h2>
          <p>
            {project.description ||
              tr(
                "Bảng điều phối và theo dõi công việc theo thời gian thực.",
                "Assign work and track your team's progress.",
              )}
          </p>
        </div>
        <div className="board-actions">
          {coQuyenQuanLy && (
            <button
              type="button"
              className="button subtle"
              onClick={() => datMoCaiDat(!dangMoCaiDat)}
            >
              <Settings2 size={15} /> {tr("Cài đặt dự án", "Project settings")}
            </button>
          )}
          <div className="member-avatars">
            {danhSachThanhVien
              .filter((thanhVien) => thanhVienDuAn.includes(thanhVien.user_id))
              .slice(0, 4)
              .map((thanhVien) => (
                <span
                  key={thanhVien.user_id}
                  className="avatar small"
                  title={thanhVien.name}
                >
                  {thanhVien.name[0]}
                </span>
              ))}
          </div>
          {coQuyenQuanLy && (
            <select
              disabled={dangXuLy}
              aria-label={tr("Thêm thành viên dự án", "Add project member")}
              value=""
              onChange={(suKien) => themThanhVien(Number(suKien.target.value))}
            >
              <option value="">+ {tr("Thành viên", "Member")}</option>
              {danhSachThanhVien
                .filter(
                  (thanhVien) => !thanhVienDuAn.includes(thanhVien.user_id),
                )
                .map((thanhVien) => (
                  <option key={thanhVien.user_id} value={thanhVien.user_id}>
                    {thanhVien.name}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>
      {dangMoCaiDat && coQuyenQuanLy && (
        <form className="panel project-settings" onSubmit={luuDuAn}>
          <h3>{tr("Cài đặt dự án", "Project settings")}</h3>
          <div className="member-list">
            {danhSachThanhVien
              .filter((thanhVien) => thanhVienDuAn.includes(thanhVien.user_id))
              .map((thanhVien) => (
                <div key={thanhVien.user_id}>
                  <span>{thanhVien.name}</span>
                  <span className="badge">
                    {enumLabel(thanhVien.role, language)}
                  </span>
                  {thanhVien.role === "MEMBER" && (
                    <button
                      type="button"
                      className="button danger"
                      disabled={dangXuLy}
                      onClick={() => boThanhVien(thanhVien.user_id)}
                    >
                      {tr("Bỏ khỏi dự án", "Remove from project")}
                    </button>
                  )}
                </div>
              ))}
          </div>
          <div className="field-grid">
            <label>
              {tr("Tên dự án", "Project name")}
              <input
                required
                value={tenDuAn}
                onChange={(suKien) => datTenDuAn(suKien.target.value)}
              />
            </label>
            <label>
              {tr("Trạng thái", "Status")}
              <select
                value={trangThaiDuAn}
                onChange={(suKien) => datTrangThaiDuAn(suKien.target.value)}
              >
                {["PLANNING", "ACTIVE", "ON_HOLD", "COMPLETED", "ARCHIVED"].map(
                  (congViec) => (
                    <option key={congViec} value={congViec}>
                      {enumLabel(congViec, language)}
                    </option>
                  ),
                )}
              </select>
            </label>
          </div>
          <label>
            {tr("Mô tả", "Description")}
            <textarea
              value={moTaDuAn}
              onChange={(suKien) => datMoTaDuAn(suKien.target.value)}
            />
          </label>
          <div className="drawer-actions">
            <button type="submit" className="button primary">
              {tr("Lưu thay đổi", "Save changes")}
            </button>
            <button type="button" className="button danger" onClick={xoaDuAn}>
              {tr("Xóa dự án", "Delete project")}
            </button>
          </div>
        </form>
      )}
      {loiHienThi && (
        <div className="error">
          <button type="button" onClick={() => datLoiHienThi("")}>
            ×
          </button>
          {messageText(loiHienThi)}
        </div>
      )}
      <div className="board-toolbar">
        <form onSubmit={taoCongViec} className="task-create-form">
          <label className="task-title-field">
            {tr("Công việc mới", "New task")}
            <input
              value={tenCongViecMoi}
              onChange={(suKien) => datTenCongViecMoi(suKien.target.value)}
              placeholder={tr("Tên công việc mới...", "New task title...")}
              maxLength={240}
              disabled={dangXuLy}
              required
            />
          </label>
          <label>
            {tr("Giao cho", "Assign to")}
            <select
              aria-label={tr("Giao cho", "Assign to")}
              value={nguoiNhanMoi}
              disabled={dangXuLy}
              onChange={(event) => datNguoiNhanMoi(Number(event.target.value))}
            >
              <option value={0}>{tr("Chưa giao", "Unassigned")}</option>
              {thanhVienCoQuyen.map((thanhVien) => (
                <option key={thanhVien.user_id} value={thanhVien.user_id}>
                  {thanhVien.name} (@{thanhVien.username})
                </option>
              ))}
            </select>
          </label>
          <label className="task-hours-field">
            {tr("Dự kiến (giờ)", "Estimated hours")}
            <input
              type="number"
              min={0}
              max={99999}
              step="0.01"
              placeholder="0"
              value={gioDuKienMoi}
              disabled={dangXuLy}
              onChange={(event) => datGioDuKienMoi(event.target.value)}
            />
          </label>
          <button type="submit" className="button primary" disabled={dangXuLy}>
            <Plus size={16} />{" "}
            {dangXuLy
              ? tr("Đang lưu…", "Saving…")
              : tr("Tạo công việc", "Create task")}
          </button>
        </form>
      </div>
      {coQuyenQuanLy && !congViecDangChon && congViecVuaTao?.project_id === project.id && (
        <AssignmentWarning
          key={congViecVuaTao.id}
          task={congViecVuaTao}
          disabled={dangXuLy}
          onChanged={taiDuLieu}
          onDismiss={() => datCongViecVuaTao(null)}
        />
      )}
      <div className="board-filters">
        <input
          aria-label={tr("Tìm công việc", "Search tasks")}
          placeholder={tr("Tìm kiếm công việc...", "Search tasks...")}
          value={tuKhoa}
          onChange={(suKien) => datTuKhoa(suKien.target.value)}
        />
        <select
          aria-label={tr("Lọc ưu tiên", "Filter priority")}
          value={locUuTien}
          onChange={(suKien) => datLocUuTien(suKien.target.value)}
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
          value={locNguoiNhan}
          onChange={(suKien) => datLocNguoiNhan(Number(suKien.target.value))}
        >
          <option value={0}>{tr("Mọi thành viên", "All members")}</option>
          <option value={-1}>{tr("Chưa giao", "Unassigned")}</option>
          {thanhVienCoQuyen.map((thanhVien) => (
            <option key={thanhVien.user_id} value={thanhVien.user_id}>
              {thanhVien.name}
            </option>
          ))}
        </select>
      </div>
      <p className="board-hint muted">
        {congViecHienThi.length} / {danhSachCongViec.length}{" "}
        {tr("công việc", "tasks")} ·{" "}
        {tr(
          "Bấm vào thẻ để xem và chỉnh sửa.",
          "Open a card to view or edit it.",
        )}
        {!!(tuKhoa || locUuTien || locNguoiNhan) && (
          <>
            {" "}
            {tr(
              "Bỏ bộ lọc để kéo thả công việc.",
              "Clear filters to drag tasks.",
            )}
          </>
        )}
      </p>
      <div className="kanban">
        {danhSachCot.map((cot) => {
          const congViecTrongCot = congViecHienThi
            .filter((congViec) => congViec.column_id === cot.id)
            .sort(
              (viecTruoc, viecSau) => viecTruoc.position - viecSau.position,
            );
          return (
            <section
              aria-label={enumLabel(cot.name, language)}
              className="kanban-column"
              key={cot.id}
              onDragOver={(suKien) => suKien.preventDefault()}
              onDrop={(suKien) => {
                suKien.preventDefault();
                if (tuKhoa || locUuTien || locNguoiNhan) return;
                const maCongViec = Number(
                  suKien.dataTransfer.getData("task-id"),
                );
                const congViec = danhSachCongViec.find(
                  (congViec) => congViec.id === maCongViec,
                );
                if (congViec)
                  chuyenCongViec(congViec, cot.id, congViecTrongCot.length);
              }}
            >
              <div className="column-head">
                <span className={`column-dot ${cot.is_done ? "done" : ""}`} />
                <strong>{enumLabel(cot.name, language)}</strong>
                <span className="count">{congViecTrongCot.length}</span>
              </div>
              <div className="column-body">
                {congViecTrongCot.map((congViec, viTri) => {
                  const thanhVienNhan = danhSachThanhVien.find(
                    (thanhVien) => thanhVien.user_id === congViec.assignee_id,
                  );
                  const tenNguoiNhan =
                    thanhVienNhan?.name || tr("Chưa giao", "Unassigned");
                  const chuCaiDau =
                    thanhVienNhan?.name[0]?.toUpperCase() || "?";
                  return (
                    <button
                      type="button"
                      key={congViec.id}
                      draggable={!tuKhoa && !locUuTien && !locNguoiNhan}
                      onDragStart={(suKien) =>
                        suKien.dataTransfer.setData(
                          "task-id",
                          String(congViec.id),
                        )
                      }
                      onDragOver={(suKien) => suKien.preventDefault()}
                      onDrop={(suKien) => {
                        suKien.preventDefault();
                        suKien.stopPropagation();
                        if (tuKhoa || locUuTien || locNguoiNhan) return;
                        const maCongViec = Number(
                          suKien.dataTransfer.getData("task-id"),
                        );
                        const congViec = danhSachCongViec.find(
                          (congViec) => congViec.id === maCongViec,
                        );
                        if (congViec) chuyenCongViec(congViec, cot.id, viTri);
                      }}
                      className="task-card"
                      onClick={() => chonCongViec(congViec)}
                    >
                      <div className="task-card-header">
                        <span className="task-card-id">#{congViec.id}</span>
                        <span
                          className={`priority ${congViec.priority.toLowerCase()}`}
                        >
                          {enumLabel(congViec.priority, language)}
                        </span>
                      </div>
                      <h4>{congViec.title}</h4>
                      {congViec.description && <p>{congViec.description}</p>}
                      <div className="task-meta">
                        <span
                          title={tr(
                            "Ước lượng / Thực tế",
                            "Estimated / Actual",
                          )}
                        >
                          <Clock3 size={12} />
                          {tr("Ước lượng", "Est.")} {congViec.estimated_hours}h
                          · {tr("Thực tế", "Actual")} {congViec.actual_hours}h
                        </span>
                        {congViec.due_date && (
                          <span title={tr("Hạn hoàn thành", "Due date")}>
                            <CalendarDays size={12} />
                            {congViec.due_date}
                          </span>
                        )}
                      </div>
                      <span
                        className={`task-assignee ${congViec.assignee_id ? "" : "unassigned"}`}
                        title={tenNguoiNhan}
                      >
                        <span className="avatar tiny">{chuCaiDau}</span>
                        {tenNguoiNhan}
                      </span>
                    </button>
                  );
                })}
                {!congViecTrongCot.length && (
                  <div className="column-empty">
                    {tr("Chưa có công việc", "No tasks yet")}
                  </div>
                )}
              </div>
            </section>
          );
        })}
        {coQuyenQuanLy && (
          <div className="kanban-add">
            <form onSubmit={themCot}>
              <input
                value={tenCotMoi}
                onChange={(suKien) => datTenCotMoi(suKien.target.value)}
                placeholder={tr("Tên cột mới", "New column name")}
                required
              />
              <button type="submit" className="button subtle">
                + {tr("Thêm cột", "Add column")}
              </button>
            </form>
          </div>
        )}
      </div>
      {congViecDangChon && (
        <TaskPanel
          key={congViecDangChon.id}
          projectId={project.id}
          task={
            danhSachCongViec.find(
              (congViec) => congViec.id === congViecDangChon.id,
            ) || congViecDangChon
          }
          columns={danhSachCot}
          members={thanhVienCoQuyen}
          refreshKey={lanLamMoi}
          canManage={coQuyenQuanLy}
          onClose={() => chonCongViec(null)}
          onChanged={taiDuLieu}
        />
      )}
    </>
  );
}

function TaskPanel({
  projectId,
  task,
  columns,
  members,
  refreshKey,
  canManage,
  onClose,
  onChanged,
}: {
  projectId: number;
  task: Task;
  columns: Column[];
  members: Member[];
  refreshKey: number;
  canManage: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const { language, t: tr, message: messageText } = useLanguage();
  const [tenCongViec, datTenCongViec] = useState(task.title);
  const [moTa, datMoTa] = useState(task.description);
  const [uuTien, datUuTien] = useState(task.priority);
  const [nguoiNhan, datNguoiNhan] = useState(task.assignee_id || 0);
  const [gioDuKien, datGioDuKien] = useState(task.estimated_hours);
  const [gioThucTe, datGioThucTe] = useState(task.actual_hours);
  const [hanHoanThanh, datHanHoanThanh] = useState(task.due_date || "");
  const [danhSachViecCon, datDanhSachViecCon] = useState<Subtask[]>([]);
  const [viecConDangSua, datViecConDangSua] = useState<Subtask | null>(null);
  const [danhSachBinhLuan, datDanhSachBinhLuan] = useState<Comment[]>([]);
  const [nhatKy, datNhatKy] = useState<Activity[]>([]);
  const [kyNangCanCo, datKyNangCanCo] = useState<string[]>([]);
  const [tenViecConMoi, datTenViecConMoi] = useState("");
  const [noiDungBinhLuan, datNoiDungBinhLuan] = useState("");
  const [loiHienThi, datLoiHienThi] = useState("");
  const [dangXuLy, datDangXuLy] = useState(false);
  const [coThayDoiChuaLuu, datCoThayDoiChuaLuu] = useState(false);
  const [phienBanDangSua, datPhienBanDangSua] = useState(task.version);
  const [coXungDot, datCoXungDot] = useState(false);
  const [daLuu, datDaLuu] = useState(false);
  const [congViecVuaGiao, datCongViecVuaGiao] = useState<Task | null>(null);
  const hopChiTiet = useRef<HTMLDialogElement>(null);
  function dongChiTiet() {
    if (dangXuLy) return;
    if (
      (coThayDoiChuaLuu || viecConDangSua !== null) &&
      !confirm(
        tr(
          "Bạn có thay đổi chưa lưu. Bỏ thay đổi và đóng?",
          "You have unsaved changes. Discard them and close?",
        ),
      )
    )
      return;
    onClose();
  }
  useEffect(() => {
    const hopThoai = hopChiTiet.current;
    if (hopThoai && !hopThoai.open) hopThoai.showModal();
    return () => {
      hopThoai?.close();
    };
  }, []);
  const taiDuLieu = useCallback(async () => {
    try {
      const [viecCon, binhLuan, hoatDong, kyNang] = await Promise.all([
        api.get<Subtask[]>(`/tasks/${task.id}/subtasks`),
        api.get<Comment[]>(`/tasks/${task.id}/comments`),
        api.get<Activity[]>(`/tasks/${task.id}/activity`),
        api.get<string[]>(`/tasks/${task.id}/required-skills`),
      ]);
      datDanhSachViecCon(viecCon);
      datDanhSachBinhLuan(binhLuan);
      datNhatKy(hoatDong);
      datKyNangCanCo(kyNang);
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    }
  }, [task.id]);
  useEffect(() => {
    taiDuLieu();
  }, [taiDuLieu, refreshKey]);
  useEffect(() => {
    // Có bản sửa chưa lưu thì không lấy dữ liệu realtime ghi đè form.
    if (coThayDoiChuaLuu) return;
    datTenCongViec(task.title);
    datMoTa(task.description);
    datUuTien(task.priority);
    datNguoiNhan(task.assignee_id || 0);
    datGioDuKien(task.estimated_hours);
    datGioThucTe(task.actual_hours);
    datHanHoanThanh(task.due_date || "");
    datPhienBanDangSua(task.version);
  }, [task, coThayDoiChuaLuu]);
  async function luuCongViec(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangXuLy) return;
    datLoiHienThi("");
    datCoXungDot(false);
    datDangXuLy(true);
    try {
      const daCapNhat = await api.patch<Task>(`/tasks/${task.id}`, {
        title: tenCongViec,
        description: moTa,
        priority: uuTien,
        assignee_id: nguoiNhan || null,
        estimated_hours: Number(gioDuKien),
        actual_hours: Number(gioThucTe),
        due_date: hanHoanThanh || null,
        version: phienBanDangSua,
      });
      datCongViecVuaGiao(daCapNhat.assignee_id ? daCapNhat : null);
      await onChanged();
      datCoThayDoiChuaLuu(false);
      datDaLuu(true);
    } catch (loi) {
      datCoXungDot(loi instanceof ApiError && loi.status === 409);
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function themViecCon(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.post(`/tasks/${task.id}/subtasks`, {
        title: tenViecConMoi,
        description: "",
        done: false,
        estimated_hours: 0,
        actual_hours: 0,
      });
      datTenViecConMoi("");
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function doiTrangThaiViecCon(viecCon: Subtask) {
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.put(`/subtasks/${viecCon.id}`, {
        version: viecCon.version,
        title: viecCon.title,
        description: viecCon.description,
        done: !viecCon.done,
        assignee_id: viecCon.assignee_id,
        estimated_hours: viecCon.estimated_hours,
        actual_hours: viecCon.actual_hours,
        due_date: viecCon.due_date,
      });
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
      if (loi instanceof ApiError && loi.status === 409) await taiDuLieu();
    } finally {
      datDangXuLy(false);
    }
  }
  async function luuViecCon(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (!viecConDangSua || dangXuLy) return;
    datDangXuLy(true);
    try {
      const duLieu = {
        title: viecConDangSua.title,
        description: viecConDangSua.description,
        done: viecConDangSua.done,
        assignee_id: viecConDangSua.assignee_id,
        estimated_hours: viecConDangSua.estimated_hours,
        actual_hours: viecConDangSua.actual_hours,
        due_date: viecConDangSua.due_date,
        version: viecConDangSua.version,
      };
      await api.put(`/subtasks/${viecConDangSua.id}`, duLieu);
      datViecConDangSua(null);
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
      if (loi instanceof ApiError && loi.status === 409) await taiDuLieu();
    } finally {
      datDangXuLy(false);
    }
  }
  async function xoaViecCon(viecCon: Subtask) {
    if (dangXuLy || !confirm(tr("Xóa việc con này?", "Delete this subtask?")))
      return;
    datDangXuLy(true);
    try {
      await api.delete(`/subtasks/${viecCon.id}`);
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function guiBinhLuan(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangXuLy) return;
    datDangXuLy(true);
    try {
      await api.post(`/tasks/${task.id}/comments`, {
        content: noiDungBinhLuan,
      });
      datNoiDungBinhLuan("");
      await taiDuLieu();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  async function xoaCongViec() {
    if (dangXuLy) return;
    if (!confirm(tr("Xóa task này?", "Delete this task?"))) return;
    datDangXuLy(true);
    try {
      await api.delete(`/tasks/${task.id}`);
      onClose();
      onChanged();
    } catch (loi) {
      datLoiHienThi((loi as Error).message);
    } finally {
      datDangXuLy(false);
    }
  }
  return (
    <dialog
      ref={hopChiTiet}
      aria-label={tr("Chi tiết công việc", "Task details")}
      onCancel={(event) => {
        event.preventDefault();
        dongChiTiet();
      }}
      className="drawer-overlay"
      onMouseDown={(suKien) => {
        if (suKien.target === suKien.currentTarget) dongChiTiet();
      }}
    >
      <div className="drawer">
        <div className="drawer-top">
          <span className="eyebrow">
            {tr("Công việc", "Task")} #{task.id} · {tr("Dự án", "Project")} #
            {projectId}
          </span>
          <button
            type="button"
            className="icon-button"
            disabled={dangXuLy}
            onClick={dongChiTiet}
            aria-label={tr("Đóng", "Close")}
          >
            <X size={18} />
          </button>
        </div>
        <h2>{tr("Chi tiết công việc", "Task details")}</h2>
        {loiHienThi && (
          <div className="error" role="alert">
            {messageText(loiHienThi)}
          </div>
        )}
        {canManage && congViecVuaGiao && (
          <AssignmentWarning
            key={congViecVuaGiao.version}
            task={congViecVuaGiao}
            disabled={dangXuLy || coThayDoiChuaLuu}
            onChanged={onChanged}
            onDismiss={() => datCongViecVuaGiao(null)}
          />
        )}
        {daLuu && !coThayDoiChuaLuu && (
          <div className="success" role="status">
            {tr("Đã lưu thay đổi.", "Changes saved.")}
          </div>
        )}
        {coThayDoiChuaLuu && task.version !== phienBanDangSua && !coXungDot && (
          <p className="error" role="status">
            {tr(
              "Công việc vừa được người khác cập nhật. Bản sửa của bạn vẫn được giữ; hãy kiểm tra xung đột khi lưu.",
              "Someone updated this task. Your draft is preserved; check for conflicts when saving.",
            )}
          </p>
        )}
        <label>
          {tr("Chuyển sang cột", "Move to column")}
          <select
            value={task.column_id}
            disabled={dangXuLy || coThayDoiChuaLuu}
            onChange={async (event) => {
              const column_id = Number(event.target.value);
              datDangXuLy(true);
              datLoiHienThi("");
              try {
                await api.post(`/tasks/${task.id}/move`, {
                  column_id,
                  position: 0,
                  version: phienBanDangSua,
                });
                await onChanged();
              } catch (loi) {
                datCoXungDot(loi instanceof ApiError && loi.status === 409);
                datLoiHienThi((loi as Error).message);
              } finally {
                datDangXuLy(false);
              }
            }}
          >
            {columns.map((column) => (
              <option key={column.id} value={column.id}>
                {enumLabel(column.name, language)}
              </option>
            ))}
          </select>
        </label>
        {coThayDoiChuaLuu && (
          <p className="muted">
            {tr(
              "Lưu bản sửa trước khi chuyển cột.",
              "Save your edits before moving the task.",
            )}
          </p>
        )}
        {coXungDot && (
          <button
            type="button"
            className="button subtle"
            onClick={async () => {
              await onChanged();
              datCoThayDoiChuaLuu(false);
              datCoXungDot(false);
              datLoiHienThi("");
            }}
          >
            {tr("Bỏ bản sửa và tải dữ liệu mới", "Discard draft and reload")}
          </button>
        )}
        <form
          onSubmit={luuCongViec}
          onChange={() => {
            datCoThayDoiChuaLuu(true);
            datDaLuu(false);
          }}
        >
          <fieldset disabled={dangXuLy}>
            <label>
              {tr("Tiêu đề", "Title")}
              <input
                required
                maxLength={240}
                value={tenCongViec}
                onChange={(suKien) => datTenCongViec(suKien.target.value)}
              />
            </label>
            <label>
              {tr("Mô tả", "Description")}
              <textarea
                rows={4}
                value={moTa}
                onChange={(suKien) => datMoTa(suKien.target.value)}
              />
            </label>
            <div className="field-grid">
              <label>
                {tr("Ưu tiên", "Priority")}
                <select
                  value={uuTien}
                  onChange={(suKien) => datUuTien(suKien.target.value)}
                >
                  {["LOW", "MEDIUM", "HIGH", "URGENT"].map((congViec) => (
                    <option key={congViec} value={congViec}>
                      {enumLabel(congViec, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Người thực hiện", "Assignee")}
                <select
                  aria-label={tr("Người thực hiện", "Assignee")}
                  value={nguoiNhan}
                  onChange={(suKien) =>
                    datNguoiNhan(Number(suKien.target.value))
                  }
                >
                  <option value={0}>{tr("Chưa giao", "Unassigned")}</option>
                  {members.map((thanhVien) => (
                    <option key={thanhVien.user_id} value={thanhVien.user_id}>
                      {thanhVien.name} (@{thanhVien.username})
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Ước lượng (giờ)", "Estimate (hours)")}
                <input
                  type="number"
                  min="0"
                  max="99999"
                  step="0.01"
                  value={gioDuKien}
                  onChange={(suKien) =>
                    datGioDuKien(Number(suKien.target.value))
                  }
                />
              </label>
              <label>
                {tr("Thực tế (giờ)", "Actual (hours)")}
                <input
                  type="number"
                  min="0"
                  max="99999"
                  step="0.01"
                  value={gioThucTe}
                  onChange={(suKien) =>
                    datGioThucTe(Number(suKien.target.value))
                  }
                />
              </label>
              <label>
                {tr("Hạn hoàn thành", "Due date")}
                <input
                  type="date"
                  value={hanHoanThanh}
                  onChange={(suKien) => datHanHoanThanh(suKien.target.value)}
                />
              </label>
            </div>
            <div className="drawer-actions">
              <button
                type="submit"
                className="button primary"
                disabled={dangXuLy}
              >
                {tr("Lưu thay đổi", "Save changes")}
              </button>
              <button
                className="button danger"
                type="button"
                onClick={xoaCongViec}
                disabled={dangXuLy}
              >
                {tr("Xóa", "Delete")}
              </button>
            </div>
          </fieldset>
        </form>
        <section className="drawer-section">
          <h3>{tr("Kỹ năng cần thiết", "Required skills")}</h3>
          <p>
            {kyNangCanCo.length
              ? kyNangCanCo.join(" · ")
              : tr("Chưa có kỹ năng được ghi nhận.", "No skills recorded yet.")}
          </p>
        </section>
        <section className="drawer-section">
          <h3>
            {tr("Công việc con", "Subtasks")}{" "}
            <span className="count">{danhSachViecCon.length}</span>
          </h3>
          {danhSachViecCon.map((viecCon) => (
            <div className="subtask-row" key={viecCon.id}>
              <input
                type="checkbox"
                checked={viecCon.done}
                disabled={dangXuLy || viecConDangSua !== null}
                aria-label={`${tr("Hoàn thành việc con", "Complete subtask")} ${viecCon.title}`}
                onChange={() => doiTrangThaiViecCon(viecCon)}
              />
              <span className={viecCon.done ? "strike" : ""}>
                {viecCon.title}
              </span>
              <small>
                {viecCon.estimated_hours}h ·{" "}
                {members.find((nguoi) => nguoi.user_id === viecCon.assignee_id)
                  ?.name || tr("Theo task cha", "Inherited assignee")}
              </small>
              <button
                type="button"
                className="button subtle"
                disabled={dangXuLy || viecConDangSua !== null}
                onClick={() => datViecConDangSua({ ...viecCon })}
              >
                {tr("Sửa", "Edit")}
              </button>
              <button
                type="button"
                className="button subtle"
                disabled={dangXuLy || viecConDangSua !== null}
                onClick={() => xoaViecCon(viecCon)}
              >
                {tr("Xóa", "Delete")}
              </button>
            </div>
          ))}
          {viecConDangSua && (
            <form
              onSubmit={luuViecCon}
              className="panel"
              aria-label={tr("Sửa việc con", "Edit subtask")}
            >
              <label>
                {tr("Tên việc con", "Subtask title")}
                <input
                  required
                  maxLength={240}
                  value={viecConDangSua.title}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      title: suKien.target.value,
                    })
                  }
                />
              </label>
              <label>
                {tr("Mô tả việc con", "Subtask description")}
                <textarea
                  value={viecConDangSua.description}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      description: suKien.target.value,
                    })
                  }
                />
              </label>
              <label>
                {tr("Người nhận việc con", "Subtask assignee")}
                <select
                  value={viecConDangSua.assignee_id || 0}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      assignee_id: Number(suKien.target.value) || null,
                    })
                  }
                >
                  <option value={0}>
                    {tr("Theo task cha", "Inherited assignee")}
                  </option>
                  {members.map((nguoi) => (
                    <option key={nguoi.user_id} value={nguoi.user_id}>
                      {nguoi.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr("Giờ dự kiến việc con", "Subtask estimate")}
                <input
                  required
                  type="number"
                  min="0"
                  max="99999"
                  step="0.01"
                  value={viecConDangSua.estimated_hours}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      estimated_hours: Number(suKien.target.value),
                    })
                  }
                />
              </label>
              <label>
                {tr("Giờ thực tế việc con", "Subtask actual hours")}
                <input
                  required
                  type="number"
                  min="0"
                  max="99999"
                  step="0.01"
                  value={viecConDangSua.actual_hours}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      actual_hours: Number(suKien.target.value),
                    })
                  }
                />
              </label>
              <label>
                {tr("Hạn việc con", "Subtask due date")}
                <input
                  type="date"
                  value={viecConDangSua.due_date || ""}
                  onChange={(suKien) =>
                    datViecConDangSua({
                      ...viecConDangSua,
                      due_date: suKien.target.value || null,
                    })
                  }
                />
              </label>
              <button
                type="submit"
                className="button primary"
                disabled={dangXuLy}
              >
                {tr("Lưu việc con", "Save subtask")}
              </button>
              <button
                type="button"
                className="button subtle"
                disabled={dangXuLy}
                onClick={() => datViecConDangSua(null)}
              >
                {tr("Hủy", "Cancel")}
              </button>
              <button
                type="button"
                className="button subtle"
                disabled={dangXuLy}
                onClick={() => {
                  const banMoi = danhSachViecCon.find(
                    (viec) => viec.id === viecConDangSua.id,
                  );
                  if (
                    banMoi &&
                    confirm(
                      tr(
                        "Bỏ bản sửa việc con và lấy dữ liệu mới?",
                        "Discard subtask edits and load current data?",
                      ),
                    )
                  )
                    datViecConDangSua({ ...banMoi });
                }}
              >
                {tr("Lấy bản việc con mới", "Reload subtask")}
              </button>
            </form>
          )}
          <form className="inline-form" onSubmit={themViecCon}>
            <input
              required
              value={tenViecConMoi}
              onChange={(suKien) => datTenViecConMoi(suKien.target.value)}
              placeholder={tr("Tên việc con mới...", "New subtask title...")}
            />
            <button type="submit" className="button subtle" disabled={dangXuLy}>
              + {tr("Thêm", "Add")}
            </button>
          </form>
        </section>
        <section className="drawer-section">
          <h3>{tr("Bình luận", "Comments")}</h3>
          {danhSachBinhLuan.map((binhLuan) => (
            <div className="comment" key={binhLuan.id}>
              <span className="avatar small">
                {members.find(
                  (thanhVien) => thanhVien.user_id === binhLuan.author_id,
                )?.name[0] || "U"}
              </span>
              <div>
                <small>
                  {members.find(
                    (thanhVien) => thanhVien.user_id === binhLuan.author_id,
                  )?.name || `User #${binhLuan.author_id}`}{" "}
                  · {formatTimestamp(binhLuan.created_at, language)}
                </small>
                <p>{binhLuan.content}</p>
              </div>
            </div>
          ))}
          <form onSubmit={guiBinhLuan}>
            <textarea
              required
              rows={2}
              value={noiDungBinhLuan}
              onChange={(suKien) => datNoiDungBinhLuan(suKien.target.value)}
              placeholder={tr(
                "Viết bình luận. Mention bằng @username...",
                "Write a comment. Mention with @username...",
              )}
            />
            <button
              type="submit"
              className="button primary"
              disabled={dangXuLy}
            >
              {tr("Gửi bình luận", "Post comment")}
            </button>
          </form>
        </section>
        <section className="drawer-section">
          <h3>{tr("Nhật ký hoạt động", "Activity log")}</h3>
          <div className="activity-list">
            {nhatKy.map((hoatDong) => (
              <div key={hoatDong.id}>
                <span className="activity-dot" />
                <span>
                  <strong>{enumLabel(hoatDong.action, language)}</strong>
                  <small>
                    {members.find(
                      (thanhVien) => thanhVien.user_id === hoatDong.actor_id,
                    )?.name || `User #${hoatDong.actor_id}`}{" "}
                    · {formatTimestamp(hoatDong.created_at, language)}
                  </small>
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </dialog>
  );
}
