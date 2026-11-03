"""Private local document store. Keys are generated, never taken from filenames."""
import hashlib
import re
import secrets
from pathlib import Path
from app.core import settings


def root() -> Path:
    path = Path(settings.document_storage_dir)
    if not path.is_absolute():
        path = Path(__file__).resolve().parents[2] / path
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def path_for(key: str) -> Path:
    if not re.fullmatch(r"[a-f0-9]{48}", key):
        raise ValueError("Invalid storage key")
    return root() / key


def put(content: bytes) -> tuple[str, str]:
    key = secrets.token_hex(24)
    target = path_for(key)
    with target.open("xb") as stream:
        stream.write(content)
    return key, hashlib.sha256(content).hexdigest()


def read(key: str, digest: str) -> bytes:
    content = path_for(key).read_bytes()
    if hashlib.sha256(content).hexdigest() != digest:
        raise OSError("Document checksum mismatch")
    return content


def remove(key: str):
    path_for(key).unlink(missing_ok=True)
