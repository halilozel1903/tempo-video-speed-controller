"""Build an unpacked directory and ZIP containing only distributable files."""
# Keep the build scripts compatible with JitPack's default Python 3 image.
from pathlib import Path
import json
import hashlib
import shutil
import zipfile

root = Path(__file__).resolve().parents[1]
destination = root / 'dist' / 'tempo'
if destination.exists():
    shutil.rmtree(str(destination))
destination.mkdir(parents=True)
files = ['manifest.json', 'settings.js', 'content.js', 'popup.html', 'popup.css', 'popup.js',
         'README.md', 'README.tr.md', 'CONTRIBUTING.md', 'LICENSE', 'docs/images/tempo-popup.png']
files += ['icons/{}.png'.format(size) for size in (16, 32, 48, 128)]
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
package = json.loads((root / 'package.json').read_text(encoding='utf-8'))
if manifest['version'] != package['version']:
    raise SystemExit('manifest.json and package.json must have the same version.')
for name in files:
    target = destination / name
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(str(root / name), str(target))
archive = root / 'dist' / 'tempo-edge-{}.zip'.format(manifest['version'])
with zipfile.ZipFile(str(archive), 'w') as bundle:
    for name in sorted(files):
        # Fixed metadata keeps the archive stable across checkouts and file timestamps.
        entry = zipfile.ZipInfo('tempo/{}'.format(name), date_time=(1980, 1, 1, 0, 0, 0))
        entry.create_system = 3
        entry.external_attr = 0o100644 << 16
        entry.compress_type = zipfile.ZIP_DEFLATED
        bundle.writestr(entry, (destination / name).read_bytes())
checksum = archive.with_suffix('.zip.sha256')
checksum.write_text('{}  {}\n'.format(hashlib.sha256(archive.read_bytes()).hexdigest(), archive.name))
print('Unpacked: {}\nZIP: {}\nSHA-256: {}'.format(destination, archive, checksum))
