"""Run verification against a disposable MySQL database in the local Compose stack."""
import argparse
from pathlib import Path
import subprocess


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project", default="dacn")
    parser.add_argument("--skip-load", action="store_true")
    parser.add_argument("--output-dir", type=Path, default=Path("test-results/mysql"))
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    output = args.output_dir.resolve()
    output.mkdir(parents=True, exist_ok=True)
    options = "['tests/run_verification.py', '--output-dir', '/evidence'" + (", '--skip-load'" if args.skip_load else "") + "]"
    script = (
        "import os,runpy,sys; from sqlalchemy.engine import URL; "
        "os.environ['DATABASE_URL']=URL.create('mysql+pymysql',username='root',"
        "password=os.environ['MYSQL_ROOT_PASSWORD'],host='mysql',port=3306,"
        "database=os.environ.get('MYSQL_DATABASE','smart_task_manager')).render_as_string(hide_password=False); "
        "os.environ['FRONTEND_ORIGIN']='http://localhost:3000'; "
        f"sys.argv={options}; runpy.run_path('tests/run_verification.py',run_name='__main__')"
    )
    subprocess.run([
        "docker", "compose", "-p", args.project, "-f", "docker-compose.yml",
        "run", "--rm", "--no-deps", "-T", "-v", f"{root / 'backend'}:/code",
        "-v", f"{output}:/evidence", "backend", "python", "-c", script,
    ], cwd=root, check=True)


if __name__ == "__main__":
    main()
