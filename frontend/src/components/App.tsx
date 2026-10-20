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
import { api, base, getToken, logout, refresh } from "@/lib/api";
import type { Project, User, Workspace } from "@/lib/types";
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
  const { language, t } = useLanguage();
  const [boot, setBoot] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [section, setSection] = useState<Section>("dashboard");
  const [error, setError] = useState("");
  const [mobile, setMobile] = useState(false);
  const [newWorkspace, setNewWorkspace] = useState("");
  const [newProject, setNewProject] = useState("");
  const [unread, setUnread] = useState(0);
  const [online, setOnline] = useState(false);
  const [notificationEvent, setNotificationEvent] = useState(0);
  const load = useCallback(async () => {
    try {
      const [me, ws] = await Promise.all([
        api.get<User>("/auth/me"),
        api.get<Workspace[]>("/workspaces"),
      ]);
      setUser(me);
      setWorkspaces(ws);
      const saved = Number(localStorage.getItem("workspace_id"));
      setWorkspace(ws.find((w) => w.id === saved) || ws[0] || null);
    } catch {
      setUser(null);
    }
  }, []);
  useEffect(() => {
    refresh()
      .then((ok) => (ok ? load() : setUser(null)))
      .finally(() => setBoot(false));
  }, [load]);
  useEffect(() => {
    if (!workspace) {
      setProjects([]);
      setProject(null);
      return;
    }
    localStorage.setItem("workspace_id", String(workspace.id));
    api
      .get<Project[]>(`/workspaces/${workspace.id}/projects`)
      .then((rows) => {
        setError("");
        setProjects(rows);
        setProject(
          (old) => rows.find((p) => p.id === old?.id) || rows[0] || null,
        );
      })
      .catch((e) => setError(e.message));
  }, [workspace, online]);
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
        .then((data) => setUnread(data.count))
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
  }, [user]);
  async function createWorkspace(e: React.FormEvent) {
    e.preventDefault();
    try {
      const ws = await api.post<Workspace>("/workspaces", {
        name: newWorkspace,
        description: "",
      });
      setWorkspaces([...workspaces, ws]);
      setWorkspace(ws);
      setNewWorkspace("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function createProject(e: React.FormEvent) {
    e.preventDefault();
    if (!workspace) return;
    try {
      const p = await api.post<Project>(
        `/workspaces/${workspace.id}/projects`,
        { name: newProject, description: "", status: "ACTIVE" },
      );
      setProjects([...projects, p]);
      setProject(p);
      setNewProject("");
      setSection("board");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (boot)
    return (
      <div className="center-page">
        <div className="spinner" />{" "}
        {t("Đang tải không gian làm việc…", "Loading workspace…")}
      </div>
    );
  if (!user) return <AuthScreen onLogin={load} />;
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
        <nav className="nav-list">
          {nav.map((n) => (
            <button
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
            className="logout"
            onClick={async () => {
              await logout();
              setUser(null);
            }}
          >
            <LogOut size={17} /> {t("Đăng xuất", "Log out")}
          </button>
        </div>
      </aside>
      <div className="main-area">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setMobile(true)}
            aria-label={t("Mở menu", "Open menu")}
          >
            <Menu />
          </button>
          <div>
            <span className="breadcrumb">
              WORKSPACE // {workspace?.name || t("Bắt đầu", "Get started")}
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
              className="icon-button"
              title={t("Thông báo", "Notifications")}
              onClick={() => setSection("notifications")}
            >
              <Bell size={20} />
              {unread > 0 && <span className="unread-badge">{unread}</span>}
            </button>
            <button className="avatar" onClick={() => setSection("profile")}>
              {user.name[0]?.toUpperCase()}
            </button>
          </div>
        </header>
        <main className="content">
          <InvitationInbox onAccepted={() => { load(); }} refreshKey={notificationEvent} />
          {error && (
            <div className="error">
              <button onClick={() => setError("")}>×</button>
              {error}
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
                <button className="button primary">
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
                  <form className="inline-form" onSubmit={createProject}>
                    <input
                      required
                      value={newProject}
                      onChange={(e) => setNewProject(e.target.value)}
                      placeholder={t("Tên dự án mới", "New project name")}
                    />
                    <button className="button primary">
                      + {t("Tạo dự án", "Create project")}
                    </button>
                  </form>
                  <div className="project-list">
                    {projects.map((p) => (
                      <button
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
                    <form className="inline-form" onSubmit={createProject}>
                      <input
                        required
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        placeholder={t("Tên dự án", "Project name")}
                      />
                      <button className="button primary">
                        {t("Tạo dự án", "Create project")}
                      </button>
                    </form>
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
                    <button className="button primary">
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
