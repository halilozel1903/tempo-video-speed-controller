"""Package Tempo and install its ZIP artifact into JitPack's Maven repository."""
from pathlib import Path
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
coordinates = {name: os.environ.get(name, '').strip() for name in ('GROUP', 'ARTIFACT', 'VERSION')}
if not all(coordinates.values()):
    raise SystemExit('JitPack must provide GROUP, ARTIFACT, and VERSION.')

subprocess.run([sys.executable, str(root / 'scripts' / 'package.py')], cwd=root, check=True)
version = json.loads((root / 'manifest.json').read_text())['version']
archive = root / 'dist' / f'tempo-edge-{version}.zip'
subprocess.run([
    'mvn', '--batch-mode', 'org.apache.maven.plugins:maven-install-plugin:3.2.0:install-file',
    f'-Dfile={archive}',
    f'-DgroupId={coordinates["GROUP"]}',
    f'-DartifactId={coordinates["ARTIFACT"]}',
    f'-Dversion={coordinates["VERSION"]}',
    '-Dpackaging=zip',
    '-DgeneratePom=true',
], cwd=root, check=True)
