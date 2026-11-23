"""Package Tempo and install its ZIP artifact into JitPack's Maven repository."""
# Keep the build scripts compatible with JitPack's default Python 3 image.
from pathlib import Path
import json
import os
import subprocess
import sys

root = Path(__file__).resolve().parents[1]
coordinates = {name: os.environ.get(name, '').strip() for name in ('GROUP', 'ARTIFACT', 'VERSION')}
if not all(coordinates.values()):
    raise SystemExit('JitPack must provide GROUP, ARTIFACT, and VERSION.')

subprocess.run([sys.executable, str(root / 'scripts' / 'package.py')], cwd=str(root), check=True)
version = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))['version']
archive = root / 'dist' / 'tempo-edge-{}.zip'.format(version)
subprocess.run([
    'mvn', '--batch-mode', 'org.apache.maven.plugins:maven-install-plugin:3.2.0:install-file',
    '-Dfile={}'.format(archive),
    '-DgroupId={}'.format(coordinates['GROUP']),
    '-DartifactId={}'.format(coordinates['ARTIFACT']),
    '-Dversion={}'.format(coordinates['VERSION']),
    '-Dpackaging=zip',
    '-DgeneratePom=true',
], cwd=str(root), check=True)
