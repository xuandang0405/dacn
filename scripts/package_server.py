"""Package the current source tree for Windows/Docker; never includes local secrets/data."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import zipfile
from datetime import date

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'Smart_Task_Manager_Server/'
TREES = ('backend/app', 'backend/alembic', 'backend/tests', 'frontend/src', 'frontend/tests', 'server')
FILES = (
    'backend/Dockerfile', 'backend/.dockerignore', 'backend/alembic.ini',
    'backend/requirements.txt', 'backend/requirements.lock', 'backend/seed.py', 'backend/seed_mvp.py',
    'frontend/Dockerfile', 'frontend/.dockerignore', 'frontend/biome.json',
    'frontend/package.json', 'frontend/package-lock.json', 'frontend/next.config.ts',
    'frontend/tsconfig.json', 'frontend/next-env.d.ts', 'frontend/playwright.config.ts',
    'database/schema.sql', '.env.server.example', '.gitignore', '.gitattributes',
    'start-server.bat', 'stop-server.bat', 'logs-server.bat',
    'scripts/deploy_server.ps1', 'scripts/package_server.py',
)
IGNORED = {'.git', '__pycache__', '.pytest_cache', '.venv', 'node_modules', '.next'}
PRIVATE_KEY = re.compile(rb'AIza[0-9A-Za-z_-]{30,}|AQ\.[0-9A-Za-z_-]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----')


def live_secrets():
    """Compare privately with local env values; never include or print them."""
    values = []
    for path in (ROOT / '.env', ROOT / 'backend/.env', ROOT / '.env.server'):
        if not path.exists():
            continue
        for line in path.read_text(encoding='utf-8-sig').splitlines():
            key, sep, value = line.partition('=')
            value = value.strip().strip('\"\'')
            if sep and any(word in key.upper() for word in ('PASSWORD', 'SECRET', 'API_KEY', 'TOKEN')) and len(value) >= 12 and not value.startswith(('replace-with-', 'change-me-', 'generated-by-')):
                values.append(value.encode())
    return values


def source_files():
    paths = {ROOT / name for name in FILES}
    for tree in TREES:
        paths.update(path for path in (ROOT / tree).rglob('*') if path.is_file())
    for path in sorted(paths):
        relative = path.relative_to(ROOT)
        if any(part in IGNORED for part in relative.parts) or path.suffix in ('.pyc', '.tsbuildinfo'):
            continue
        if path.name in ('AGENTS.md', 'CLAUDE.md') or (path.name.startswith('.env') and not path.name.endswith('.example')):
            continue
        if path.suffix.lower() in ('.db', '.sqlite', '.sqlite3', '.log', '.pem', '.key', '.pfx', '.p12', '.zip', '.rar'):
            raise RuntimeError(f'Private/runtime file found in source allowlist: {relative.as_posix()}')
        yield relative.as_posix(), path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / f'dist/Smart_Task_Manager_Windows_Docker_{date.today():%Y%m%d}.zip')
    args = parser.parse_args()
    secrets = live_secrets()
    contents = {}
    for name, path in source_files():
        data = path.read_bytes()
        if name.endswith(('.bat', '.ps1')):
            data = data.replace(b'\r\n', b'\n').replace(b'\n', b'\r\n')
        if PRIVATE_KEY.search(data) or any(secret in data for secret in secrets):
            raise RuntimeError(f'Secret scan rejected {name}; no secret value printed')
        contents[name] = data
    contents['README_DEPLOY.md'] = (ROOT / 'server/README_WINDOWS.md').read_bytes()
    verification = ROOT / 'server/VERIFICATION.md'
    if not verification.exists():
        raise RuntimeError('Write actual deployment verification results before packaging')
    contents['VERIFICATION.md'] = verification.read_bytes()
    manifest = {'package': 'Smart Task Manager Windows Docker', 'date': date.today().isoformat(),
                'files': [{'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()} for name, data in sorted(contents.items())],
                'excluded': ['local .env files and API keys', 'databases and uploaded documents', 'Git history', 'node_modules/.next/.venv', 'local reports and archives']}
    contents['MANIFEST.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    output = args.output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, data in sorted(contents.items()):
            archive.writestr(PREFIX + name, data)
    with zipfile.ZipFile(output) as archive:
        if archive.testzip() is not None:
            raise RuntimeError('ZIP integrity test failed')
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(f'{digest}  {output.name}\n', encoding='ascii')
    print(json.dumps({'archive': str(output), 'files': len(contents), 'bytes': output.stat().st_size, 'sha256': digest, 'secret_scan': 'passed', 'zip_integrity': 'passed'}))


if __name__ == '__main__':
    main()
