export const base = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
let accessToken: string | null = null;
export function setToken(token: string | null) {
  accessToken = token;
}
export function getToken() {
  return accessToken;
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
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers,
    credentials: "include",
    cache: "no-store",
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    const ok = await refresh();
    if (ok) return request<T>(path, init, false);
  }
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
  try {
    const data = await request<{ access_token: string }>(
      "/auth/refresh",
      { method: "POST" },
      false,
    );
    setToken(data.access_token);
    return true;
  } catch {
    setToken(null);
    return false;
  }
}
export async function logout() {
  try {
    await api.post("/auth/logout");
  } finally {
    setToken(null);
  }
}
