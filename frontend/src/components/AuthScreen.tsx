"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import logoImg from "@/img/logo.png";
import { api, setToken } from "@/lib/api";
import { LanguageSwitch, useLanguage } from "@/lib/language";

export default function AuthScreen({ onLogin }: { onLogin: () => void }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reset"))
      setMode("reset");
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (mode === "register")
        await api.post("/auth/register", { email, username, name, password });
      if (mode === "forgot") {
        const result = await api.post<{ message: string }>(
          "/auth/forgot-password",
          { email },
        );
        setError(result.message);
        return;
      }
      if (mode === "reset") {
        await api.post("/auth/reset-password", {
          token: new URLSearchParams(window.location.search).get("reset"),
          new_password: password,
        });
        window.history.replaceState({}, "", "/");
        setMode("login");
        setError(
          t(
            "Mật khẩu đã đổi. Vui lòng đăng nhập.",
            "Password changed. Please log in.",
          ),
        );
        return;
      }
      const token = await api.post<{ access_token: string }>("/auth/login", {
        email,
        password,
      });
      setToken(token.access_token);
      onLogin();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : t("Không thể đăng nhập", "Unable to log in"),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <div style={{ position: "absolute", right: 24, top: 20, zIndex: 2 }}>
        <LanguageSwitch />
      </div>
      <div className="auth-visual">
        <div className="brand-mark">
          <Image
            src={logoImg}
            alt="STM"
            width={48}
            height={48}
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </div>
        <div>
          <p className="eyebrow">DIGITAL MANUSCRIPT & WORKSHOP LEDGER</p>
          <h1>
            {t("Làm việc rõ ràng.", "Work with clarity.")}
            <br />
            {t("Tiến độ trong tầm tay.", "Keep progress in sight.")}
          </h1>
          <p>
            {t(
              "Quản lý dự án, theo dõi năng lực nhóm và biến ý tưởng thành kế hoạch thực thi với AI.",
              "Manage projects, track team capacity and turn ideas into actionable plans with AI.",
            )}
          </p>
        </div>
        <div className="auth-visual-footer">
          PROJECTS // PEOPLE // CAPACITY // PROGRESS
        </div>
      </div>
      <form className="auth-card" onSubmit={submit}>
        <div className="auth-card-top">
          <Image src={logoImg} alt="STM" width={26} height={26} />
          <span>Smart Task Manager</span>
        </div>
        <h2>
          {mode === "register"
            ? t("Tạo tài khoản", "Create account")
            : mode === "forgot"
              ? t("Quên mật khẩu", "Forgot password")
              : mode === "reset"
                ? t("Đặt mật khẩu mới", "Set a new password")
                : t("Chào mừng trở lại", "Welcome back")}
        </h2>
        <p className="muted">
          {mode === "login"
            ? t(
                "Đăng nhập để tiếp tục công việc của bạn.",
                "Log in to continue your work.",
              )
            : mode === "register"
              ? t(
                  "Bắt đầu quản lý dự án cùng nhóm.",
                  "Start managing projects with your team.",
                )
              : mode === "reset"
                ? t(
                    "Chọn mật khẩu mới cho tài khoản.",
                    "Choose a new password for your account.",
                  )
                : t(
                    "Nhập email để nhận liên kết khôi phục.",
                    "Enter your email for a recovery link.",
                  )}
        </p>
        {mode === "register" && (
          <>
            <label>
              {t("Họ tên", "Full name")}
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("Nguyễn Văn A", "Alex Smith")}
              />
            </label>
            <label>
              {t("Tên dùng để @mention", "Username for @mentions")}
              <input
                required
                minLength={3}
                maxLength={40}
                pattern="[A-Za-z][A-Za-z0-9_]*"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="nguyenvana"
              />
            </label>
          </>
        )}
        {mode !== "reset" && (
          <label>
            Email
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </label>
        )}
        {mode !== "forgot" && (
          <label>
            {t("Mật khẩu", "Password")}
            <input
              required
              type="password"
              minLength={
                mode === "register" || mode === "reset" ? 10 : undefined
              }
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••"
            />
          </label>
        )}
        {error && <div className="error">{error}</div>}
        <button className="button primary full" disabled={busy}>
          {busy
            ? t("Đang xử lý…", "Working…")
            : mode === "register"
              ? t("Tạo tài khoản", "Create account")
              : mode === "forgot"
                ? t("Gửi email", "Send email")
                : mode === "reset"
                  ? t("Đổi mật khẩu", "Change password")
                  : t("Đăng nhập", "Log in")}
        </button>
        <div className="auth-links">
          {mode === "login" ? (
            <>
              <button type="button" onClick={() => setMode("register")}>
                {t("Tạo tài khoản", "Create account")}
              </button>
              <button type="button" onClick={() => setMode("forgot")}>
                {t("Quên mật khẩu?", "Forgot password?")}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setMode("login")}>
              {t("Quay lại đăng nhập", "Back to login")}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
