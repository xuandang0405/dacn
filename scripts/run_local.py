"""Run the local API, scheduler, and Next.js app in one Windows console."""

import hashlib
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
DEFAULT_DATABASE_URL = (
    "mysql+pymysql://root@127.0.0.1:3306/smart_task_manager?charset=utf8mb4"
)


def run(command: list[str], *, cwd: Path = ROOT, env: dict[str, str] | None = None):
    subprocess.run(command, cwd=cwd, env=env, check=True)


def prepare(env: dict[str, str]):
    if not shutil.which("npm.cmd"):
        raise RuntimeError("Node.js/npm is missing. Install Node.js 22 or newer.")

    backend_env = BACKEND / ".env"
    if not backend_env.exists():
        backend_env.write_text(
            "JWT_SECRET=" + secrets.token_urlsafe(48) + "\n", encoding="utf-8"
        )
        print("Created backend/.env with a random JWT secret.", flush=True)

    requirements = BACKEND / "requirements.txt"
    requirements_hash = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = BACKEND / ".venv" / "requirements.sha256"
    if not stamp.exists() or stamp.read_text(encoding="utf-8") != requirements_hash:
        print("Installing backend dependencies...", flush=True)
        run(
            [sys.executable, "-m", "pip", "install", "-q", "--disable-pip-version-check", "-r", str(requirements)],
            env=env,
        )
        stamp.write_text(requirements_hash, encoding="utf-8")

    if not (FRONTEND / "node_modules" / "next" / "package.json").exists():
        print("Installing frontend dependencies...", flush=True)
        run(["npm.cmd", "ci"], cwd=FRONTEND, env=env)

    import pymysql
    from sqlalchemy.engine import make_url

    url = make_url(env["DATABASE_URL"])
    database = url.database
    if not database or not re.fullmatch(r"[A-Za-z0-9_]+", database):
        raise RuntimeError("DATABASE_URL must contain a simple database name.")
    try:
        connection = pymysql.connect(
            host=url.host or "127.0.0.1",
            port=url.port or 3306,
            user=url.username or "root",
            password=url.password or "",
            connect_timeout=5,
            autocommit=True,
        )
        with connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"CREATE DATABASE IF NOT EXISTS `{database}` "
                    "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
                )
    except pymysql.MySQLError as exc:
        raise RuntimeError(
            "Cannot connect to MySQL. Start it and check DATABASE_URL."
        ) from exc
    print(f"Database ready: {database}", flush=True)

    print("Applying Alembic migrations...", flush=True)
    run(
        [sys.executable, "-m", "alembic", "-c", "alembic.ini", "upgrade", "head"],
        cwd=BACKEND,
        env=env,
    )


def port_in_use(port: int) -> bool:
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=0.4):
            return True
    except OSError:
        return False


def wait_for_http(url: str, processes: list[tuple[str, subprocess.Popen]], timeout: int):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        for name, process in processes:
            code = process.poll()
            if code is not None:
                raise RuntimeError(f"{name} exited early with code {code}.")
        try:
            with urlopen(url, timeout=1) as response:
                if response.status == 200:
                    return
        except OSError:
            pass
        time.sleep(0.5)
    raise RuntimeError(f"Timed out waiting for {url}.")


def stop_processes(processes: list[tuple[str, subprocess.Popen]]):
    for _, process in reversed(processes):
        if process.poll() is None:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )


def main() -> int:
    env = os.environ.copy()
    env.setdefault("DATABASE_URL", DEFAULT_DATABASE_URL)
    env["FRONTEND_ORIGIN"] = "http://localhost:3000"
    env["NEXT_PUBLIC_API_URL"] = "http://localhost:8000"
    processes: list[tuple[str, subprocess.Popen]] = []
    try:
        if "--check" not in sys.argv[1:]:
            occupied = [str(port) for port in (8000, 3000) if port_in_use(port)]
            if occupied:
                raise RuntimeError(
                    "Port(s) " + ", ".join(occupied)
                    + " are already in use. Close the previous project window or service, then try again."
                )
        prepare(env)
        if "--check" in sys.argv[1:]:
            print("Checks passed. No services started.")
            return 0
        flags = subprocess.CREATE_NEW_PROCESS_GROUP
        services = [
            (
                "API",
                [sys.executable, "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8000"],
                BACKEND,
            ),
            ("Scheduler", [sys.executable, "-m", "app.jobs.deadlines"], BACKEND),
            ("Frontend", ["cmd.exe", "/d", "/c", "npm.cmd", "run", "dev"], FRONTEND),
        ]
        for name, command, cwd in services:
            process = subprocess.Popen(
                command, cwd=cwd, env=env, creationflags=flags
            )
            processes.append((name, process))

        wait_for_http("http://127.0.0.1:8000/health", processes, 30)
        wait_for_http("http://127.0.0.1:3000/", processes, 60)
        print("\nFrontend: http://localhost:3000", flush=True)
        print("API docs: http://localhost:8000/docs", flush=True)
        print("Press Ctrl+C here to stop all three services.\n", flush=True)
        while True:
            for name, process in processes:
                code = process.poll()
                if code is not None:
                    raise RuntimeError(f"{name} stopped with code {code}.")
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping services...", flush=True)
        return 0
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr, flush=True)
        return 1
    finally:
        stop_processes(processes)


if __name__ == "__main__":
    raise SystemExit(main())
