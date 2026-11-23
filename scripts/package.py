"""Build an unpacked directory and ZIP containing only distributable files."""
from pathlib import Path
import json
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
destination = root / 'dist' / 'tempo'
if destination.exists():
    shutil.rmtree(destination)
destination.mkdir(parents=True)
files = ['manifest.json', 'settings.js', 'content.js', 'popup.html', 'popup.css', 'popup.js',
         'README.md', 'README.tr.md', 'CONTRIBUTING.md', 'LICENSE', 'docs/images/tempo-popup.png']
files += [f'icons/{size}.png' for size in (16, 32, 48, 128)]
manifest = json.loads((root / 'manifest.json').read_text())
for name in files:
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, target)
archive = root / 'dist' / f'tempo-edge-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as bundle:
    for name in files:
        bundle.write(destination / name, f'tempo/{name}')
print(f'Unpacked: {destination}\nZIP: {archive}')
