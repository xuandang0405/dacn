"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Blocks,
  Bot,
  ChartNoAxesCombined,
  CircleHelp,
  FolderKanban,
  ListTodo,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  Users,
  X,
} from "lucide-react";
import {
  api,
  base,
  getSessionVersion,
  getToken,
  logout,
  refresh,
  SESSION_EVENT,
} from "@/lib/api";
import type { Member, Project, User, Workspace } from "@/lib/types";
import InvitationInbox from "./InvitationInbox";
import Brand, { BrandSlogan } from "./Brand";
import AuthScreen from "./AuthScreen";
import Overview from "./Overview";
import Board from "./Board";
import Skills from "./Skills";
import AIAssistant from "./AIAssistant";
import Notifications from "./Notifications";
import SettingsPanel from "./SettingsPanel";
import MyTasks from "./MyTasks";
import { enumLabel, LanguageSwitch, useLanguage } from "@/lib/language";

type Section =
  | "dashboard"
  | "projects"
  | "my_tasks"
  | "board"
  | "members"
  | "skills"
  | "workload"
  | "ai"
  | "analytics"
  | "notifications"
  | "settings"
  | "profile";
export default function App() {
  const { language, t, message: messageText } = useLanguage();
  const [boot, setBoot] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [loi, datLoi] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [mobile, setMobile] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [newProject, setNewProject] = useState("");
  const [unread, setUnread] = useState(0);
  const [coKetNoi, datKetNoi] = useState(false);
  const [lanDoiThongBao, datLanDoiThongBao] = useState(0);
  const [lanDoiCongViec, datLanDoiCongViec] = useState(0);
  const [taskToOpen, setTaskToOpen] = useState<number | null>(null);
  const [vaiTroTrongNhom, datVaiTroTrongNhom] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [workspaceFormOpen, setWorkspaceFormOpen] = useState(false);
  const canManageWorkspace =
    vaiTroTrongNhom === "OWNER" || vaiTroTrongNhom === "ADMIN";
  useEffect(() => {
    if (!mobile) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [mobile]);
  useEffect(() => {
    const end = (event: Event) => {
      const reason = (event as CustomEvent<string>).detail;
      let thongBao = "Your session has ended. Please sign in again.";
      if (reason === "logout") thongBao = "";
      if (reason === "password_changed")
        thongBao = "Password changed. Please log in.";
      setAuthNotice(thongBao);
      setUser(null);
      setWorkspace(null);
      datVaiTroTrongNhom("");
      setWorkspaces([]);
      setProjects([]);
      setProject(null);
      setUnread(0);
      datLoi("");
      setSection("dashboard");
    };
    window.addEventListener(SESSION_EVENT, end);
    return () => window.removeEventListener(SESSION_EVENT, end);
  }, []);
  const taiThongTinTaiKhoan = useCallback(async () => {
    // Không khôi phục thông tin cũ nếu người dùng đã đăng xuất khi đang tải.
    const phienLucBatDau = getSessionVersion();
    try {
      const [me, ws] = await Promise.all([
        api.get<User>("/auth/me"),
        api.get<Workspace[]>("/workspaces"),
      ]);
      if (phienLucBatDau !== getSessionVersion()) return;
      setUser(me);
      setAuthNotice("");
      setWorkspaces(ws);
      const nhomDaChon = Number(localStorage.getItem("workspace_id"));
      setWorkspace(ws.find((w) => w.id === nhomDaChon) || ws[0] || null);
    } catch {
      if (phienLucBatDau === getSessionVersion()) setUser(null);
    }
  }, []);
  useEffect(() => {
    refresh()
      .then((daLamMoi) => {
        if (daLamMoi) return taiThongTinTaiKhoan();
        setUser(null);
      })
      .finally(() => setBoot(false));
  }, [taiThongTinTaiKhoan]);
  useEffect(() => {
    let conHieuLuc = true;
    if (!workspace) {
      setProjects([]);
      setProject(null);
      datVaiTroTrongNhom("");
      return;
    }
    localStorage.setItem("workspace_id", String(workspace.id));
    Promise.all([
      api.get<Project[]>(`/workspaces/${workspace.id}/projects`),
      api.get<Member[]>(`/workspaces/${workspace.id}/members`),
    ])
      .then(([rows, members]) => {
        if (!conHieuLuc) return;
        datVaiTroTrongNhom(
          members.find((m) => m.user_id === user?.id)?.role || "",
        );
        datLoi("");
        setProjects(rows);
        setProject(
          (old) => rows.find((p) => p.id === old?.id) || rows[0] || null,
        );
      })
      .catch((e) => {
        if (conHieuLuc) datLoi(e.message);
      });
    return () => {
      conHieuLuc = false;
    };
  }, [workspace, coKetNoi, user?.id]);
  useEffect(() => {
    if (!user) return;
    const kiemTraKetNoi = () =>
      fetch(`${base}/health`, { cache: "no-store" })
        .then((r) => datKetNoi(r.ok))
        .catch(() => datKetNoi(false));
    kiemTraKetNoi();
    const lichKiemTraKetNoi = setInterval(kiemTraKetNoi, 30000);
    return () => clearInterval(lichKiemTraKetNoi);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const update = () =>
      api
        .get<{ count: number }>("/notifications/unread-count")
        .then((data) => {
          setUnread(data.count);
          datLanDoiThongBao((value) => value + 1);
          datLanDoiCongViec((value) => value + 1);
        })
        .catch(() => {});
    update();
    const lichCapNhat = setInterval(update, 30000);
    return () => clearInterval(lichCapNhat);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let ketNoi: WebSocket | undefined;
    let daDong = false;
    const ketNoiThongBao = () => {
      const maTruyCap = getToken();
      if (!maTruyCap || daDong) return;
      ketNoi = new WebSocket(
        `${base.replace(/^http/, "ws")}/api/v1/ws/notifications`,
      );
      ketNoi.onopen = () => ketNoi?.send(maTruyCap);
      ketNoi.onmessage = (e) => {
        const thongBao = JSON.parse(e.data);
        if (
          thongBao.event === "task.changed" ||
          thongBao.event === "connected" ||
          (thongBao.event === "workspace.changed" &&
            thongBao.payload?.workspace_id === workspace?.id)
        ) {
          datLanDoiCongViec((value) => value + 1);
        }
        if (thongBao.event === "notification.created") {
          if (
            thongBao.payload?.kind === "role_changed" ||
            thongBao.payload?.kind === "membership_removed" ||
            thongBao.payload?.kind === "project_access_changed"
          )
            taiThongTinTaiKhoan();
          datLanDoiThongBao((n) => n + 1);
          api
            .get<{ count: number }>("/notifications/unread-count")
            .then((data) => setUnread(data.count))
            .catch(() => {});
        }
      };
      ketNoi.onclose = () => {
        if (!daDong) setTimeout(ketNoiThongBao, 2500);
      };
    };
    ketNoiThongBao();
    return () => {
      daDong = true;
      ketNoi?.close();
    };
  }, [user, taiThongTinTaiKhoan, workspace?.id]);
  async function taoNhom(e: React.FormEvent) {
    e.preventDefault();
    if (creatingWorkspace) return;
    setCreatingWorkspace(true);
    datLoi("");
    try {
      const ws = await api.post<Workspace>("/workspaces", {
        name: newWorkspace,
        description: "",
      });
      setWorkspaces((rows) => [...rows, ws]);
      setWorkspace(ws);
      setNewWorkspace("");
      setWorkspaceFormOpen(false);
      setSection("dashboard");
    } catch (e) {
      datLoi((e as Error).message);
    } finally {
      setCreatingWorkspace(false);
    }
  }
  async function taoDuAn(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !canManageWorkspace || creatingProject) return;
    setCreatingProject(true);
    datLoi("");
    try {
      const p = await api.post<Project>(
        `/workspaces/${workspace.id}/projects`,
        { name: newProject, description: "", status: "ACTIVE" },
      );
      setProjects((rows) => [...rows, p]);
      setProject(p);
      setNewProject("");
      setSection("board");
    } catch (e) {
      datLoi((e as Error).message);
    } finally {
      setCreatingProject(false);
    }
  }
  if (boot)
    return (
      <div className="center-page">
        <div className="spinner" />{" "}
        {t("Đang tải không gian làm việc…", "Loading workspace…")}
      </div>
    );
  if (!user)
    return <AuthScreen onLogin={taiThongTinTaiKhoan} notice={authNotice} />;
  const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: t("Tổng quan", "Overview"),
      icon: <LayoutDashboard />,
    },
    { id: "projects", label: t("Dự án", "Projects"), icon: <FolderKanban /> },
    {
      id: "my_tasks",
      label: t("Công việc của tôi", "My tasks"),
      icon: <ListTodo />,
    },
    { id: "board", label: t("Bảng công việc", "Task board"), icon: <Blocks /> },
    { id: "members", label: t("Thành viên", "Members"), icon: <Users /> },
    { id: "skills", label: t("Kỹ năng", "Skills"), icon: <CircleHelp /> },
    {
      id: "workload",
      label: t("Khối lượng", "Workload"),
      icon: <ChartNoAxesCombined />,
    },
    { id: "ai", label: t("Trợ lý AI", "AI Assistant"), icon: <Bot /> },
    {
      id: "analytics",
      label: t("Phân tích", "Analytics"),
      icon: <ChartNoAxesCombined />,
    },
    { id: "settings", label: t("Cài đặt", "Settings"), icon: <Settings2 /> },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <div className="sidebar-brand">
          <div className="sidebar-brand-copy">
            <Brand />
            <p className="brand-tagline">
              <BrandSlogan />
            </p>
          </div>
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMobile(false)}
            aria-label={t("Đóng menu", "Close menu")}
          >
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-caption">
          {t("KHÔNG GIAN LÀM VIỆC", "WORKSPACE")}
        </div>
        <select
          aria-label={t("Không gian làm việc", "Workspace")}
          className="workspace-select"
          value={workspace?.id || ""}
          onChange={(e) => {
            setProject(null);
            setProjects([]);
            datVaiTroTrongNhom("");
            setTaskToOpen(null);
            datLoi("");
            setWorkspace(
              workspaces.find((w) => w.id === Number(e.target.value)) || null,
            );
            setSection("dashboard");
          }}
        >
          {workspaces.length === 0 && (
            <option value="">{t("Chưa có workspace", "No workspace")}</option>
          )}
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        {workspaces.length > 0 && (
          <>
            <button
              type="button"
              className="button subtle"
              onClick={() => setWorkspaceFormOpen((open) => !open)}
            >
              {t("Thêm workspace", "Add workspace")}
            </button>
            {workspaceFormOpen && (
              <form className="new-workspace-form" onSubmit={taoNhom}>
                <input
                  required
                  maxLength={160}
                  aria-label={t("Tên workspace", "Workspace name")}
                  value={newWorkspace}
                  onChange={(event) => setNewWorkspace(event.target.value)}
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={creatingWorkspace}
                >
                  {t("Tạo workspace", "Create workspace")}
                </button>
              </form>
            )}
          </>
        )}
        <nav className="nav-list">
          {nav.map((n) => (
            <button
              type="button"
              key={n.id}
              className={section === n.id ? "active" : ""}
              onClick={() => {
                setTaskToOpen(null);
                setSection(n.id);
                setMobile(false);
              }}
            >
              {n.icon}
              <span>{n.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            type="button"
            onClick={() => {
              setSection("profile");
              setMobile(false);
            }}
          >
            <span className="avatar small">{user.name[0]?.toUpperCase()}</span>
            <span>
              {user.name}
              <small>{user.email}</small>
            </span>
          </button>
          <button
            type="button"
            className="logout"
            onClick={async () => {
              try {
                await logout();
              } catch {
                setAuthNotice(
                  t(
                    "Đã đăng xuất trên thiết bị. Hãy kiểm tra kết nối trước khi đăng nhập lại.",
                    "Signed out on this device. Check your connection before signing in again.",
                  ),
                );
              }
            }}
          >
            <LogOut size={17} /> {t("Đăng xuất", "Log out")}
          </button>
        </div>
      </aside>
      {mobile && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label={t("Đóng menu", "Close menu")}
          onClick={() => setMobile(false)}
        />
      )}
      <div className="main-area">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-only"
            onClick={() => setMobile(true)}
            aria-label={t("Mở menu", "Open menu")}
          >
            <Menu />
          </button>
          <div>
            <span className="breadcrumb">
              {workspace?.name || t("Bắt đầu", "Get started")}
            </span>
            <h1>
              {nav.find((n) => n.id === section)?.label ||
                (
                  {
                    notifications: t("Thông báo", "Notifications"),
                    profile: t("Hồ sơ", "Profile"),
                  } as Record<string, string>
                )[section]}
            </h1>
          </div>
          <div className="top-actions">
            <LanguageSwitch />
            <span className={`status-pill ${coKetNoi ? "" : "offline"}`}>
              <span />{" "}
              {coKetNoi
                ? t("Hệ thống trực tuyến", "System online")
                : t("Mất kết nối API", "API offline")}
            </span>
            <button
              type="button"
              className="icon-button"
              title={t("Thông báo", "Notifications")}
              aria-label={t("Thông báo", "Notifications")}
              onClick={() => setSection("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <span className="unread-badge">{unread}</span>}
            </button>
            <button
              type="button"
              className="avatar"
              aria-label={t("Hồ sơ", "Profile")}
              onClick={() => setSection("profile")}
            >
              {user.name[0]?.toUpperCase()}
            </button>
          </div>
        </header>
        <main className="content">
          <InvitationInbox
            onAccepted={() => {
              taiThongTinTaiKhoan();
            }}
            refreshKey={lanDoiThongBao}
          />
          {loi && (
            <div className="error">
              <button type="button" onClick={() => datLoi("")}>
                ×
              </button>
              {messageText(loi)}
            </div>
          )}
          {!workspace ? (
            <div className="empty-large">
              <FolderKanban className="empty-icon" size={32} />
              <h2>
                {t(
                  "Tạo không gian làm việc đầu tiên",
                  "Create your first workspace",
                )}
              </h2>
              <p>
                {t(
                  "Mời nhóm và bắt đầu theo dõi dự án.",
                  "Invite your team and track your project.",
                )}
              </p>
              <form onSubmit={taoNhom} className="inline-form">
                <input
                  required
                  value={newWorkspace}
                  onChange={(e) => setNewWorkspace(e.target.value)}
                  placeholder={t("Tên workspace", "Workspace name")}
                />
                <button
                  type="submit"
                  className="button primary"
                  disabled={creatingWorkspace}
                >
                  {t("Tạo workspace", "Create workspace")}
                </button>
              </form>
            </div>
          ) : (
            <>
              {section === "dashboard" && (
                <Overview
                  refreshKey={lanDoiCongViec}
                  key={workspace.id}
                  workspace={workspace}
                  projects={projects}
                  onOpenProject={(p) => {
                    setProject(p);
                    setSection("board");
                  }}
                />
              )}
              {section === "projects" && (
                <div className="panel">
                  <div className="panel-header">
                    <div>
                      <h2>{t("Dự án", "Projects")}</h2>
                      <p className="muted">
                        {projects.length} {t("dự án trong", "projects in")}{" "}
                        {workspace.name}
                      </p>
                    </div>
                  </div>
                  {canManageWorkspace && (
                    <form className="inline-form" onSubmit={taoDuAn}>
                      <input
                        required
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        placeholder={t("Tên dự án mới", "New project name")}
                      />
                      <button
                        type="submit"
                        className="button primary"
                        disabled={creatingProject}
                      >
                        + {t("Tạo dự án", "Create project")}
                      </button>
                    </form>
                  )}
                  <div className="project-list">
                    {projects.map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        className="project-row"
                        onClick={() => {
                          setProject(p);
                          setSection("board");
                        }}
                      >
                        <span className="project-symbol">
                          <FolderKanban size={16} />
                        </span>
                        <span>
                          <strong>{p.name}</strong>
                          <small>
                            {p.description ||
                              t(
                                "Bảng công việc và thành viên",
                                "Tasks and members",
                              )}
                          </small>
                        </span>
                        <span className="badge">
                          {enumLabel(p.status, language)}
                        </span>
                        <span>→</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {section === "my_tasks" && (
                <MyTasks
                  key={workspace.id}
                  projects={projects}
                  userId={user.id}
                  refreshKey={lanDoiCongViec}
                  onOpenProject={(p, taskId) => {
                    setTaskToOpen(taskId);
                    setProject(p);
                    setSection("board");
                  }}
                />
              )}
              {section === "board" &&
                (project ? (
                  <Board
                    key={project.id}
                    project={project}
                    projects={projects}
                    initialTaskId={taskToOpen}
                    onSelectProject={(next) => {
                      setTaskToOpen(null);
                      setProject(next);
                    }}
                    workspace={workspace}
                    actorId={user.id}
                    onProjectChange={(updated) => {
                      setProject(updated);
                      setProjects((rows) =>
                        rows.map((p) => (p.id === updated.id ? updated : p)),
                      );
                    }}
                    onDeleted={() => {
                      setProjects((rows) =>
                        rows.filter((p) => p.id !== project.id),
                      );
                      setProject(null);
                      setSection("projects");
                    }}
                  />
                ) : (
                  <div className="empty-large">
                    <h2>{t("Chưa có dự án", "No projects yet")}</h2>
                    {canManageWorkspace ? (
                      <form className="inline-form" onSubmit={taoDuAn}>
                        <input
                          required
                          value={newProject}
                          onChange={(e) => setNewProject(e.target.value)}
                          placeholder={t("Tên dự án", "Project name")}
                        />
                        <button
                          type="submit"
                          className="button primary"
                          disabled={creatingProject}
                        >
                          {t("Tạo dự án", "Create project")}
                        </button>
                      </form>
                    ) : (
                      <p>
                        {t(
                          "Hãy liên hệ quản lý để được thêm vào dự án.",
                          "Ask a manager to add you to a project.",
                        )}
                      </p>
                    )}
                  </div>
                ))}
              {section === "members" && (
                <Skills
                  key={`${workspace.id}:${vaiTroTrongNhom}`}
                  workspace={workspace}
                  actorId={user.id}
                  membersOnly
                />
              )}
              {section === "skills" && (
                <Skills
                  key={`${workspace.id}:${vaiTroTrongNhom}`}
                  workspace={workspace}
                  actorId={user.id}
                />
              )}
              {section === "workload" && (
                <Overview
                  refreshKey={lanDoiCongViec}
                  key={workspace.id}
                  workspace={workspace}
                  projects={projects}
                  mode="workload"
                  onOpenProject={(p) => {
                    setProject(p);
                    setSection("board");
                  }}
                />
              )}
              {section === "ai" && (
                <AIAssistant
                  project={project}
                  projects={projects}
                  onSelectProject={setProject}
                  onCreated={() => setSection("board")}
                />
              )}
              {section === "analytics" && (
                <Overview
                  refreshKey={lanDoiCongViec}
                  key={workspace.id}
                  workspace={workspace}
                  projects={projects}
                  mode="analytics"
                  onOpenProject={(p) => {
                    setProject(p);
                    setSection("board");
                  }}
                />
              )}
              {section === "notifications" && (
                <Notifications
                  onUnreadChange={setUnread}
                  refreshKey={lanDoiThongBao}
                />
              )}
              {section === "settings" && (
                <SettingsPanel
                  key={`${workspace.id}:${vaiTroTrongNhom}`}
                  workspace={workspace}
                  user={user}
                  onWorkspaceChange={(updated) => {
                    setWorkspace(updated);
                    setWorkspaces((rows) =>
                      rows.map((w) => (w.id === updated.id ? updated : w)),
                    );
                  }}
                  onWorkspaceDelete={() => {
                    setWorkspaces((rows) =>
                      rows.filter((w) => w.id !== workspace.id),
                    );
                    setWorkspace(null);
                    setSection("dashboard");
                  }}
                />
              )}
              {section === "profile" && (
                <div className="panel">
                  <h2>{t("Hồ sơ", "Profile")}</h2>
                  <p>
                    <strong>{user.name}</strong>
                    <br />@{user.username}
                    <br />
                    {user.email}
                  </p>
                  <h3>{t("Tạo workspace khác", "Create another workspace")}</h3>
                  <form className="inline-form" onSubmit={taoNhom}>
                    <input
                      required
                      value={newWorkspace}
                      onChange={(e) => setNewWorkspace(e.target.value)}
                      placeholder={t("Tên workspace", "Workspace name")}
                    />
                    <button type="submit" className="button primary">
                      {t("Tạo", "Create")}
                    </button>
                  </form>
                </div>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
