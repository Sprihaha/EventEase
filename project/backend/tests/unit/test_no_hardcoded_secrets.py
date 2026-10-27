"""The admin password must never be hard-coded anywhere in the repository."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# Python assignments (optionally annotated) and env-file lines that give the variable a value.
ASSIGNMENT = re.compile(r"ADMIN_PASSWORD[ \t]*(?::[^=\n]*)?=[ \t]*[\"']?([^\s\"'#,)]*)")
# Key/value mappings in YAML or JSON files.
MAPPING = re.compile(r"[\"']?ADMIN_PASSWORD[\"']?:[ \t]*[\"']?([^\s\"'#,}]*)")
SCANNED_SUFFIXES = {".py", ".md", ".yml", ".yaml", ".example", ".toml", ".json", ".ini", ".sql", ".txt", ""}


def _repo_files() -> list[Path]:
    out = subprocess.run(
        ["git", "ls-files", "--cached", "--others", "--exclude-standard"],
        cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.splitlines()
    return [ROOT / p for p in out if (ROOT / p).suffix in SCANNED_SUFFIXES]


def _is_reference(value: str) -> bool:
    # Empty, None, or a reference to config/a generator rather than a literal.
    return value in {"", "None", "password"} or value.startswith(("os.", "settings.", "generate_password", "None"))


def test_env_example_leaves_admin_password_blank():
    lines = (ROOT / ".env.example").read_text(encoding="utf-8").splitlines()
    [line] = [entry for entry in lines if entry.startswith("ADMIN_PASSWORD")]
    assert line.split("=", 1)[1].split("#")[0].strip() == ""


def test_no_literal_admin_password_in_repo():
    offenders = []
    for path in _repo_files():
        if not path.is_file() or path.name == ".env":
            continue
        text = path.read_text(encoding="utf-8", errors="ignore")
        matches = list(ASSIGNMENT.finditer(text))
        if path.suffix in {".yml", ".yaml", ".json"}:
            matches += list(MAPPING.finditer(text))
        for match in matches:
            if not _is_reference(match.group(1)):
                offenders.append(f"{path.relative_to(ROOT)}: {match.group(0)}")
    assert offenders == []
