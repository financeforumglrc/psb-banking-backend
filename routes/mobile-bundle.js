/**
 * Mobile OTA Bundle API
 * Serves the latest Capacitor web bundle with manifest for incremental updates.
 */

const path = require('path');
const fs = require('fs');
const express = require('express');
const {
  getBundleDir,
  buildManifest,
  getManifest,
  BUNDLE_DIR,
} = require('../utils/mobile-manifest');

const router = express.Router();

// Public endpoints (no auth required for bundle download)
router.get('/version', (req, res) => {
  const manifest = getManifest();
  if (!manifest) {
    return res.status(404).json({ success: false, error: 'No bundle published. Run package:mobile first.' });
  }
  res.json({
    success: true,
    data: {
      version: manifest.version,
      builtAt: manifest.builtAt,
      fileCount: manifest.fileCount,
    },
  });
});

router.get('/manifest', (req, res) => {
  const manifest = getManifest();
  if (!manifest) {
    return res.status(404).json({ success: false, error: 'No bundle published. Run package:mobile first.' });
  }
  res.json({
    success: true,
    data: manifest,
  });
});

router.get('/files/*', (req, res) => {
  const requested = req.params[0];
  if (!requested) {
    return res.status(400).json({ success: false, error: 'File path required' });
  }

  // Path traversal protection
  const safePath = path.normalize(requested).replace(/^(\.\.\/?)+/, '').replace(/\\/g, '/');
  const fullPath = path.join(BUNDLE_DIR, safePath);
  const resolved = path.resolve(fullPath);
  const bundleResolved = path.resolve(BUNDLE_DIR);
  if (!resolved.startsWith(bundleResolved + path.sep) && resolved !== bundleResolved) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }

  if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
    return res.status(404).json({ success: false, error: 'File not found' });
  }

  // Set appropriate content type based on extension
  const ext = path.extname(safePath).toLowerCase();
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.ico': 'image/x-icon',
  };
  const contentType = mimeTypes[ext] || 'application/octet-stream';
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.sendFile(resolved);
});

module.exports = { router, buildManifest, getManifest, getBundleDir };
