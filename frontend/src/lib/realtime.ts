import { io } from "socket.io-client";
import { base, getToken } from "./api";

type Change = {
  event: string;
  payload?: { kind?: string; workspace_id?: number };
};

export function listenForChanges({
  projectId,
  onChange,
  checkAccess,
}: {
  projectId?: number;
  onChange: (change: Change) => void;
  checkAccess: () => Promise<boolean>;
}) {
  const socket = io(base || window.location.origin, {
    path: "/api/v1/socket.io/",
    auth: (callback) => callback({ token: getToken(), project_id: projectId }),
    transports: ["polling", "websocket"],
    reconnectionDelayMax: 5000,
  });
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;

  function reconnect() {
    clearTimeout(retry);
    retry = setTimeout(async () => {
      if (closed || !getToken()) return;
      const allowed = await checkAccess();
      if (!closed && allowed) socket.connect();
    }, 2500);
  }

  socket.on("connect", () => onChange({ event: "connected" }));
  socket.on("change", onChange);
  socket.on("disconnect", (reason) => {
    if (reason === "io server disconnect") reconnect();
  });
  socket.on("connect_error", () => {
    if (!socket.active) reconnect();
  });

  return () => {
    closed = true;
    clearTimeout(retry);
    socket.disconnect();
  };
}
