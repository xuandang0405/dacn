"""Create private local Docker configuration once; preserve existing configuration."""
from pathlib import Path
import secrets

root = Path(__file__).resolve().parents[1]
target = root / ".env"
if target.exists():
    print("Existing .env preserved. See README to check Docker settings.")
else:
    values = {
        "MYSQL_ROOT_PASSWORD": secrets.token_hex(24),
        "MYSQL_PASSWORD": secrets.token_hex(24),
        "JWT_SECRET": secrets.token_urlsafe(48),
    }
    lines = []
    for line in (root / ".env.example").read_text(encoding="utf-8").splitlines():
        key = line.partition("=")[0]
        if key in values:
            line = key + "=" + values[key]
        elif key == "DATABASE_URL":
            line = "DATABASE_URL=mysql+pymysql://smart_task:" + values["MYSQL_PASSWORD"] + "@mysql:3306/smart_task_manager?charset=utf8mb4"
        lines.append(line)
    with target.open("x", encoding="utf-8") as stream:
        stream.write("\n".join(lines) + "\n")
    print("Created private .env with random database and JWT secrets. Add your Gemini key locally if required.")
