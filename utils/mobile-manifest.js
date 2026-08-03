/**
 * Mobile OTA bundle manifest utilities (pure, no Express dependency).
 * Used by both the backend route and the client packaging script.
 */

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const BUNDLE_DIR = path.join(__dirname, '..', 'public', 'mobile-bundle');
const MANIFEST_PATH = path.join(BUNDLE_DIR, 'manifest.json');
const VERSION_PATH = path.join(BUNDLE_DIR, 'version.json');

function getBundleDir() {
  return BUNDLE_DIR;
}

function computeHash(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(data).digest('base64');
}

function buildManifest(bundleDir = BUNDLE_DIR) {
  if (!fs.existsSync(bundleDir)) {
    return null;
  }

  const files = [];
  const walk = (dir, relPrefix = '') => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        walk(fullPath, relPath);
      } else {
        if (entry.name === 'manifest.json' || entry.name === 'version.json') continue;
        files.push({
          path: relPath.replace(/\\/g, '/'),
          hash: computeHash(fullPath),
          size: fs.statSync(fullPath).size,
        });
      }
    }
  };

  walk(bundleDir);

  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkg = fs.existsSync(pkgPath) ? JSON.parse(fs.readFileSync(pkgPath, 'utf8')) : { version: '1.0.0' };

  const manifest = {
    version: pkg.version,
    builtAt: new Date().toISOString(),
    fileCount: files.length,
    files: files.sort((a, b) => a.path.localeCompare(b.path)),
  };

  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
  fs.writeFileSync(VERSION_PATH, JSON.stringify({
    version: manifest.version,
    builtAt: manifest.builtAt,
    fileCount: manifest.fileCount,
  }, null, 2));

  return manifest;
}

function getManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return buildManifest();
  }
  try {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  } catch {
    return buildManifest();
  }
}

module.exports = {
  getBundleDir,
  computeHash,
  buildManifest,
  getManifest,
  BUNDLE_DIR,
  MANIFEST_PATH,
  VERSION_PATH,
};
