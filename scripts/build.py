"""Build each game version into dist/portfolio-game-<version>.

No bundler: plain ES modules. The only build work is cache busting, so a new deploy
never mixes fresh and stale modules: every local import gets ?v=<content hash>.

    python3 scripts/build.py          # builds every version folder (v2, v3, ...)
    python3 scripts/build.py v3       # builds only v3
"""
from pathlib import Path
import hashlib
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]


def build(version):
    source = ROOT / version
    out = ROOT / 'dist' / f'portfolio-game-{version}'
    if out.exists():
        shutil.rmtree(out)
    shutil.copytree(source, out, ignore=shutil.ignore_patterns('*.md', '.DS_Store', 'source'))

    digest = hashlib.sha256()
    for path in sorted(source.rglob('*')):
        if path.suffix in {'.js', '.css', '.html'}:
            digest.update(path.read_bytes())
    stamp = digest.hexdigest()[:10]

    for js in (out / 'js').glob('*.js'):
        js.write_text(re.sub(r"(from '\./[\w-]+\.js)'", rf"\1?v={stamp}'", js.read_text()))
    for page in out.rglob('*.html'):
        html = page.read_text()
        html = re.sub(r'href="((?:\.\./)?style\.css)"', rf'href="\1?v={stamp}"', html)
        html = re.sub(r'src="((?:\.\./)?js/main\.js)"', rf'src="\1?v={stamp}"', html)
        page.write_text(html)
    print(f'{version} -> {out.relative_to(ROOT)} (v={stamp})')


if __name__ == '__main__':
    versions = sys.argv[1:] or sorted(p.name for p in ROOT.glob('v[0-9]*') if p.is_dir())
    for v in versions:
        build(v)
