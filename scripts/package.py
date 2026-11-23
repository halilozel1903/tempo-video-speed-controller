"""Build an unpacked directory and ZIP containing only distributable files."""
from pathlib import Path
import json
import hashlib
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
package = json.loads((root / 'package.json').read_text())
if manifest['version'] != package['version']:
    raise SystemExit('manifest.json and package.json must have the same version.')
for name in files:
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / name, target)
archive = root / 'dist' / f'tempo-edge-{manifest["version"]}.zip'
with zipfile.ZipFile(archive, 'w') as bundle:
    for name in sorted(files):
        # Fixed metadata keeps the archive stable across checkouts and file timestamps.
        entry = zipfile.ZipInfo(f'tempo/{name}', date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(entry, (destination / name).read_bytes(), compresslevel=9)
checksum = archive.with_suffix('.zip.sha256')
checksum.write_text(f'{hashlib.sha256(archive.read_bytes()).hexdigest()}  {archive.name}\n')
print(f'Unpacked: {destination}\nZIP: {archive}\nSHA-256: {checksum}')
