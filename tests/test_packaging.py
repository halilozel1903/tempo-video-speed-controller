"""Check the distribution, including reproducibility across fresh checkouts."""
from pathlib import Path
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

ROOT = Path(__file__).resolve().parents[1]


class PackagingTest(unittest.TestCase):
    def test_distribution_is_complete_private_file_free_and_reproducible(self):
        with tempfile.TemporaryDirectory(prefix='tempo-package-') as temporary:
            root = Path(temporary) / 'source'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns(
                '.git', 'node_modules', 'build', 'dist', 'graphify-out', '__pycache__', '.DS_Store'))
            (root / '.env').write_text('PRIVATE_TEST_VALUE=must-not-ship\n')
            version = json.loads((root / 'manifest.json').read_text())['version']
            archive = root / 'dist' / f'tempo-edge-{version}.zip'

            def build():
                subprocess.run([sys.executable, str(root / 'scripts' / 'package.py')],
                               cwd=root, check=True, capture_output=True)
                return archive.read_bytes()

            original = build()
            for path in root.rglob('*'):
                if path.is_file() and 'dist' not in path.relative_to(root).parts:
                    os.utime(path, (1609459200, 1609459200))
            self.assertEqual(original, build(), 'File timestamps must not change the package')
            checksum = archive.with_suffix('.zip.sha256').read_text().split()[0]
            self.assertEqual(checksum, hashlib.sha256(original).hexdigest())
            with zipfile.ZipFile(archive) as bundle:
                self.assertIsNone(bundle.testzip())
                names = set(bundle.namelist())
                self.assertIn('tempo/LICENSE', names)
                self.assertIn('tempo/README.md', names)
                self.assertIn('tempo/README.tr.md', names)
                self.assertFalse(any(part in {'node_modules', 'tests', '.env', '.git'}
                                     for name in names for part in Path(name).parts))
                manifest = json.loads(bundle.read('tempo/manifest.json'))
                resources = [manifest['action']['default_popup'], *manifest['icons'].values()]
                for script in manifest['content_scripts']:
                    resources.extend(script['js'])
                self.assertTrue(all(f'tempo/{name}' in names for name in resources))


if __name__ == '__main__':
    unittest.main()
