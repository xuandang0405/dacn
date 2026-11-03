export const base = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"
).replace(/\/+$/, "");
export const SESSION_EVENT = "stm:session-ended";
let accessToken: string | null = null;
let tokenRevision = 0;
let refreshInFlight: Promise<boolean> | null = null;
export function setToken(token: string | null) {
  accessToken = token;
  tokenRevision++;
}
export function getToken() {
  return accessToken;
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
async function request<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData))
    headers.set("Content-Type", "application/json");
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`);
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
    if (ok) return request<T>(path, init, false);
  }
  if (response.status === 401 && !publicAuth && accessToken) endSession();
  if (!response.ok) {
    let message = response.statusText;
    try {
      const data = await response.json();
      message =
        typeof data.detail === "string"
          ? data.detail
          : Array.isArray(data.detail)
            ? data.detail
                .map(
                  (item: { msg?: string }) =>
                    item.msg || "Dữ liệu không hợp lệ",
                )
                .join("; ")
            : "Yêu cầu chưa thể hoàn thành";
    } catch {}
    throw new ApiError(response.status, message);
  }
  return response.status === 204 ? (undefined as T) : response.json();
}
export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, data?: unknown) =>
    request<T>(path, {
      method: "POST",
      body: data === undefined ? undefined : JSON.stringify(data),
    }),
  upload: <T>(path: string, file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<T>(path, { method: "POST", body });
  },
  put: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(data) }),
  patch: <T>(path: string, data: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (path: string) => request<void>(path, { method: "DELETE" }),
};
export async function refresh() {
  if (refreshInFlight) return refreshInFlight;
  const revision = tokenRevision;
  const pending = (async () => {
    try {
      const data = await request<{ access_token: string }>(
        "/auth/refresh",
        { method: "POST" },
        false,
      );
      if (revision !== tokenRevision) return accessToken !== null;
      setToken(data.access_token);
      return true;
    } catch {
      if (revision === tokenRevision) {
        if (accessToken) endSession();
        else setToken(null);
      }
      return false;
    }
  })();
  refreshInFlight = pending;
  try {
    return await pending;
  } finally {
    if (refreshInFlight === pending) refreshInFlight = null;
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
