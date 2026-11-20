export const base = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
export const SESSION_EVENT = "stm:session-ended";
// Token chỉ ở bộ nhớ. Cookie HttpOnly dùng để xin token mới khi hết hạn.
let maTruyCap: string | null = null;
let lanDoiToken = 0;
let phienDangNhap = 0;
let yeuCauLamMoiDangChay: Promise<boolean> | null = null;
export function setToken(token: string | null) {
  if (token === null || maTruyCap === null) phienDangNhap++;
  maTruyCap = token;
  lanDoiToken++;
}
export function getToken() {
  return maTruyCap;
}
export function getSessionVersion() {
  return phienDangNhap;
}
export function endSession(reason = "expired") {
  setToken(null);
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(SESSION_EVENT, { detail: reason }));
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
// Gửi một yêu cầu, xử lý hết phiên và chuyển lỗi thành thông báo cho giao diện.
async function guiYeuCau<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (maTruyCap) headers.set("Authorization", `Bearer ${maTruyCap}`);
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    path.startsWith("/ai/") ? 90000 : 30000,
  );
  let response: Response;
  try {
    response = await fetch(`${base}/api/v1${path}`, {
      ...init,
      signal: init.signal
        ? AbortSignal.any([init.signal, controller.signal])
        : controller.signal,
      headers,
      credentials: "include",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError")
      throw new ApiError(408, "Request timed out; please retry");
    throw new ApiError(
      0,
      "Cannot connect to the server; check your connection",
    );
  } finally {
    clearTimeout(timeout);
  }
  const publicAuth = [
    "/auth/login",
    "/auth/register",
    "/auth/refresh",
    "/auth/logout",
    "/auth/forgot-password",
    "/auth/reset-password",
  ].includes(path);
  if (response.status === 401 && retry && !publicAuth) {
    const ok = await refresh();
    if (ok) return guiYeuCau<T>(path, init, false);
  }
  if (response.status === 401 && !publicAuth && maTruyCap) endSession();
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      if (typeof data.detail === "string") {
        message = data.detail;
      } else if (Array.isArray(data.detail)) {
        const danhSachLoi = data.detail.map(
          (loi: { msg?: string }) => loi.msg || "Dữ liệu không hợp lệ",
        );
        message = danhSachLoi.join("; ");
      } else {
        message = "Yêu cầu chưa thể hoàn thành";
      }
    } catch {}
    throw new ApiError(response.status, message);
  }
  if (response.status === 204) return undefined as T;
  return response.json();
}
export const api = {
  get: <T>(path: string) => guiYeuCau<T>(path),
  post: <T>(path: string, data?: unknown, idempotencyKey?: string) =>
    guiYeuCau<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
      headers: idempotencyKey
        ? { "Idempotency-Key": idempotencyKey }
        : undefined,
    }),
  upload: <T>(path: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return guiYeuCau<T>(path, { method: "POST", body });
  },
  put: <T>(path: string, data: unknown) =>
    guiYeuCau<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    guiYeuCau<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (path: string) => guiYeuCau<void>(path, { method: "DELETE" }),
};

type PendingTask = { key: string; body: string; time: number };
const banNhapTaoViec = new Map<string, PendingTask>();
const lanTaoDangChay = new Map<
  string,
  { body: string; promise: Promise<unknown> }
>();

export function createTask<T>(
  projectId: number,
  data: unknown,
  userId: number,
): Promise<T> {
  const noiLuu = `stm:task-create:${userId}:${projectId}`;
  const noiDung = JSON.stringify(data);
  const dangChay = lanTaoDangChay.get(noiLuu);
  if (dangChay?.body === noiDung) return dangChay.promise as Promise<T>;

  let banNhap = banNhapTaoViec.get(noiLuu);
  try {
    const daLuu = sessionStorage.getItem(noiLuu);
    if (daLuu) banNhap = JSON.parse(daLuu);
  } catch {
    /* Trình duyệt có thể chặn lưu trữ; vẫn giữ key trong bộ nhớ. */
  }
  if (
    !banNhap ||
    banNhap.body !== noiDung ||
    typeof banNhap.key !== "string" ||
    typeof banNhap.time !== "number" ||
    Date.now() - banNhap.time >= 24 * 3600 * 1000
  ) {
    const soNgauNhien = crypto.getRandomValues(new Uint8Array(16));
    const key = Array.from(soNgauNhien, (so) =>
      so.toString(16).padStart(2, "0"),
    ).join("");
    banNhap = { key, body: noiDung, time: Date.now() };
  }
  const khoa = banNhap.key;
  banNhapTaoViec.set(noiLuu, banNhap);
  try {
    sessionStorage.setItem(noiLuu, JSON.stringify(banNhap));
  } catch {}

  function xoaBanNhap() {
    if (banNhapTaoViec.get(noiLuu)?.key !== khoa) return;
    banNhapTaoViec.delete(noiLuu);
    try {
      sessionStorage.removeItem(noiLuu);
    } catch {}
  }
  const yeuCau = api
    .post<T>(`/projects/${projectId}/tasks`, data, khoa)
    .then((ketQua) => {
      xoaBanNhap();
      return ketQua;
    })
    .catch((loi) => {
      // Mất mạng/timeout/5xx có thể xảy ra sau COMMIT, nên phải giữ nguyên key.
      if (loi instanceof ApiError && (loi.status === 400 || loi.status === 422))
        xoaBanNhap();
      throw loi;
    })
    .finally(() => {
      if (lanTaoDangChay.get(noiLuu)?.promise === yeuCau)
        lanTaoDangChay.delete(noiLuu);
    });
  lanTaoDangChay.set(noiLuu, { body: noiDung, promise: yeuCau });
  return yeuCau;
}
export async function refresh() {
  // Các request hết hạn cùng lúc dùng chung một lần làm mới cookie.
  if (yeuCauLamMoiDangChay) return yeuCauLamMoiDangChay;
  const lanDoiLucBatDau = lanDoiToken;
  const yeuCauMoi = (async () => {
    try {
      const data = await guiYeuCau<{ access_token: string }>(
        "/auth/refresh",
        { method: "POST" },
        false,
      );
      // Người dùng có thể đã đăng xuất trong lúc server đang trả lời.
      if (lanDoiLucBatDau !== lanDoiToken) return maTruyCap !== null;
      setToken(data.access_token);
      return true;
    } catch {
      if (lanDoiLucBatDau === lanDoiToken) {
        if (maTruyCap) endSession();
        else setToken(null);
      }
      return false;
    }
  })();
  yeuCauLamMoiDangChay = yeuCauMoi;
  try {
    return await yeuCauMoi;
  } finally {
    if (yeuCauLamMoiDangChay === yeuCauMoi) yeuCauLamMoiDangChay = null;
  }
}
export async function logout() {
  setToken(null);
  try {
    await api.post("/auth/logout");
  } finally {
    endSession("logout");
  }
}
