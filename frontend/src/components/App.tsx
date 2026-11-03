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
import Image from "next/image";
import logoImg from "@/img/logo.png";
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
  const [error, setError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [mobile, setMobile] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [newProject, setNewProject] = useState("");
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(false);
  const [notificationEvent, setNotificationEvent] = useState(0);
  const [workspaceRole, setWorkspaceRole] = useState("");
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [workspaceFormOpen, setWorkspaceFormOpen] = useState(false);
  const canManageWorkspace =
    workspaceRole === "OWNER" || workspaceRole === "ADMIN";
  useEffect(() => {
    const end = (event: Event) => {
      const reason = (event as CustomEvent<string>).detail;
      setAuthNotice(
        reason === "logout"
          ? ""
          : reason === "password_changed"
            ? "Password changed. Please log in."
            : "Your session has ended. Please sign in again.",
      );
      setUser(null);
      setWorkspace(null);
      setWorkspaceRole("");
      setWorkspaces([]);
      setProjects([]);
      setProject(null);
      setUnread(0);
      setError("");
      setSection("dashboard");
    };
    window.addEventListener(SESSION_EVENT, end);
    return () => window.removeEventListener(SESSION_EVENT, end);
  }, []);
  const load = useCallback(async () => {
    const version = getSessionVersion();
    try {
      const [me, ws] = await Promise.all([
        api.get<User>("/auth/me"),
        api.get<Workspace[]>("/workspaces"),
      ]);
      if (version !== getSessionVersion()) return;
      setUser(me);
      setAuthNotice("");
      setWorkspaces(ws);
      const saved = Number(localStorage.getItem("workspace_id"));
      setWorkspace(ws.find((w) => w.id === saved) || ws[0] || null);
    } catch {
      if (version === getSessionVersion()) setUser(null);
    }
  }, []);
  useEffect(() => {
    refresh()
      .then((ok) => (ok ? load() : setUser(null)))
      .finally(() => setBoot(false));
  }, [load]);
  useEffect(() => {
    let active = true;
    if (!workspace) {
      setProjects([]);
      setProject(null);
      setWorkspaceRole("");
      return;
    }
    localStorage.setItem("workspace_id", String(workspace.id));
    setWorkspaceRole("");
    Promise.all([
      api.get<Project[]>(`/workspaces/${workspace.id}/projects`),
      api.get<Member[]>(`/workspaces/${workspace.id}/members`),
    ])
      .then(([rows, members]) => {
        if (!active) return;
        setWorkspaceRole(
          members.find((m) => m.user_id === user?.id)?.role || "",
        );
        setError("");
        setProjects(rows);
        setProject(
          (old) => rows.find((p) => p.id === old?.id) || rows[0] || null,
        );
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [workspace, online, user?.id]);
  useEffect(() => {
    if (!user) return;
    const checkHealth = () =>
      fetch(`${base}/health`, { cache: "no-store" })
        .then((r) => setOnline(r.ok))
        .catch(() => setOnline(false));
    checkHealth();
    const healthTimer = setInterval(checkHealth, 30000);
    return () => clearInterval(healthTimer);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    const update = () =>
      api
        .get<{ count: number }>("/notifications/unread-count")
        .then((data) => {
          setUnread(data.count);
          setNotificationEvent((value) => value + 1);
        })
        .catch(() => {});
    update();
    const timer = setInterval(update, 30000);
    return () => clearInterval(timer);
  }, [user]);
  useEffect(() => {
    if (!user) return;
    let socket: WebSocket | undefined;
    let closed = false;
    const connect = () => {
      const token = getToken();
      if (!token || closed) return;
      socket = new WebSocket(
        `${base.replace(/^http/, "ws")}/api/v1/ws/notifications`,
      );
      socket.onopen = () => socket?.send(token);
      socket.onmessage = (e) => {
        const message = JSON.parse(e.data);
        if (message.event === "notification.created") {
          if (
            message.payload?.kind === "role_changed" ||
            message.payload?.kind === "membership_removed" ||
            message.payload?.kind === "project_access_changed"
          )
            load();
          setNotificationEvent((n) => n + 1);
          api
            .get<{ count: number }>("/notifications/unread-count")
            .then((data) => setUnread(data.count))
            .catch(() => {});
        }
      };
      socket.onclose = () => {
        if (!closed) setTimeout(connect, 2500);
      };
    };
    connect();
    return () => {
      closed = true;
      socket?.close();
    };
  }, [user, load]);
  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    if (creatingWorkspace) return;
    setCreatingWorkspace(true);
    setError("");
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
      setError((e as Error).message);
    } finally {
      setCreatingWorkspace(false);
    }
  }
  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace || !canManageWorkspace || creatingProject) return;
    setCreatingProject(true);
    setError("");
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
      setError((e as Error).message);
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
  if (!user) return <AuthScreen onLogin={load} notice={authNotice} />;
  const nav: { id: Section; label: string; icon: React.ReactNode }[] = [
    {
      id: "dashboard",
      label: t("Tổng quan", "Overview"),
      icon: <LayoutDashboard />,
    },
    { id: "projects", label: t("Dự án", "Projects"), icon: <FolderKanban /> },
    {
      id: "my_tasks",
      label: t("Task của tôi", "My tasks"),
      icon: <ListTodo />,
    },
    { id: "board", label: "Kanban", icon: <Blocks /> },
    { id: "members", label: t("Thành viên", "Members"), icon: <Users /> },
    { id: "skills", label: t("Kỹ năng", "Skills"), icon: <CircleHelp /> },
    {
      id: "workload",
      label: t("Khối lượng", "Workload"),
      icon: <ChartNoAxesCombined />,
    },
    { id: "ai", label: "AI Assistant", icon: <Bot /> },
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
          <Image
            src={logoImg}
            alt="STM"
            width={34}
            height={34}
            className="logo-img"
          />
          <span>
            Smart Task
            <small>LEDGER · VOL. 01</small>
          </span>
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
          className="workspace-select"
          value={workspace?.id || ""}
          onChange={(e) => {
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
              <form className="new-workspace-form" onSubmit={createWorkspace}>
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
              {"WORKSPACE // "}
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
            <span className={`status-pill ${online ? "" : "offline"}`}>
              <span />{" "}
              {online
                ? t("Hệ thống trực tuyến", "System online")
                : t("Mất kết nối API", "API offline")}
            </span>
            <button
              type="button"
              className="icon-button"
              title={t("Thông báo", "Notifications")}
              onClick={() => setSection("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <span className="unread-badge">{unread}</span>}
            </button>
            <button
              type="button"
              className="avatar"
              onClick={() => setSection("profile")}
            >
              {user.name[0]?.toUpperCase()}
            </button>
          </div>
        </header>
        <main className="content">
          <InvitationInbox
            onAccepted={() => {
              load();
            }}
            refreshKey={notificationEvent}
          />
          {error && (
            <div className="error">
              <button type="button" onClick={() => setError("")}>
                ×
              </button>
              {messageText(error)}
            </div>
          )}
          {!workspace ? (
            <div className="empty-large">
              <div className="empty-icon">✦</div>
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
              <form onSubmit={createWorkspace} className="inline-form">
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
                    <form className="inline-form" onSubmit={createProject}>
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
                        <span className="project-symbol">№</span>
                        <span>
                          <strong>
                            № {String(p.id).padStart(2, "0")} · {p.name}
                          </strong>
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
                  projects={projects}
                  userId={user.id}
                  onOpenProject={(p) => {
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
                      <form className="inline-form" onSubmit={createProject}>
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
                <Skills workspace={workspace} actorId={user.id} membersOnly />
              )}
              {section === "skills" && (
                <Skills workspace={workspace} actorId={user.id} />
              )}
              {section === "workload" && (
                <Overview
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
                  refreshKey={notificationEvent}
                />
              )}
              {section === "settings" && (
                <SettingsPanel
                  key={workspace.id}
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
                  <form className="inline-form" onSubmit={createWorkspace}>
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
