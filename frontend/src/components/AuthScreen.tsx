"use client";
import { useEffect, useState } from "react";
import Brand, { BrandSlogan } from "./Brand";
import { api, setToken } from "@/lib/api";
import { LanguageSwitch, useLanguage } from "@/lib/language";

export default function AuthScreen({
  onLogin,
  notice = "",
}: {
  onLogin: () => void;
  notice?: string;
}) {
  const { t, message: messageText } = useLanguage();
  const [mode, setMode] = useState<"login" | "register" | "forgot" | "reset">(
    "login",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [dangXuLy, datDangXuLy] = useState(false);
  const [loi, datLoi] = useState("");
  const [success, setSuccess] = useState("");
  function doiBieuMau(next: typeof mode) {
    setMode(next);
    datLoi("");
    setSuccess("");
    setPassword("");
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has("reset"))
      setMode("reset");
  }, []);
  async function guiBieuMau(suKien: React.FormEvent) {
    suKien.preventDefault();
    if (dangXuLy) return;
    datLoi("");
    setSuccess("");
    datDangXuLy(true);
    try {
      if (mode === "register")
        await api.post("/auth/register", { email, username, name, password });
      if (mode === "forgot") {
        const result = await api.post<{ message: string }>(
          "/auth/forgot-password",
          { email },
        );
        setSuccess(result.message);
        return;
      }
      if (mode === "reset") {
        await api.post("/auth/reset-password", {
          token: new URLSearchParams(window.location.search).get("reset"),
          new_password: password,
        });
        window.history.replaceState({}, "", "/");
        setMode("login");
        setPassword("");
        setSuccess("Password changed. Please log in.");
        return;
      }
      const token = await api.post<{ access_token: string }>("/auth/login", {
        email,
        password,
      });
      setToken(token.access_token);
      onLogin();
    } catch (loi) {
      datLoi(
        loi instanceof Error
          ? loi.message
          : t("Không thể đăng nhập", "Unable to log in"),
      );
    } finally {
      datDangXuLy(false);
    }
  }
  return (
    <main className="auth-page">
      <div style={{ position: "absolute", right: 24, top: 20, zIndex: 2 }}>
        <LanguageSwitch />
      </div>
      <div className="auth-visual">
        <div className="auth-brand">
          <Brand />
        </div>
        <div>
          <h1>
            <BrandSlogan />
          </h1>
          <p>
            {t(
              "Quản lý dự án, theo dõi năng lực nhóm và biến ý tưởng thành kế hoạch thực thi với AI.",
              "Manage projects, track team capacity and turn ideas into actionable plans with AI.",
            )}
          </p>
        </div>
        <div className="auth-visual-footer">
          {t("Dự án · Thành viên · Tiến độ", "Projects · People · Progress")}
        </div>
      </div>
      <form className="auth-card" onSubmit={guiBieuMau}>
        <div className="auth-card-top">
          <Brand variant="wordmark" />
          <p className="brand-tagline">
            <BrandSlogan />
          </p>
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
                maxLength={120}
                value={name}
                onChange={(suKien) => setName(suKien.target.value)}
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
                onChange={(suKien) => setUsername(suKien.target.value)}
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
              onChange={(suKien) => setEmail(suKien.target.value)}
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
              maxLength={mode === "login" ? undefined : 128}
              value={password}
              onChange={(suKien) => setPassword(suKien.target.value)}
              placeholder="••••••••••"
            />
          </label>
        )}
        {loi && <div className="error">{messageText(loi)}</div>}
        {(success || notice) && (
          <div className="success" role="status">
            {messageText(success || notice)}
          </div>
        )}
        <button
          type="submit"
          className="button primary full"
          disabled={dangXuLy}
        >
          {dangXuLy
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
              <button
                type="button"
                disabled={dangXuLy}
                onClick={() => doiBieuMau("register")}
              >
                {t("Tạo tài khoản", "Create account")}
              </button>
              <button
                type="button"
                disabled={dangXuLy}
                onClick={() => doiBieuMau("forgot")}
              >
                {t("Quên mật khẩu?", "Forgot password?")}
              </button>
            </>
          ) : (
            <button
              type="button"
              disabled={dangXuLy}
              onClick={() => doiBieuMau("login")}
            >
              {t("Quay lại đăng nhập", "Back to login")}
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
