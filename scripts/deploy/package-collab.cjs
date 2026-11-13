/* eslint-disable @typescript-eslint/no-require-imports */
// Next가 추적하지 않는 소켓 서버는 의존성과 함께 별도로 묶는다.
const fs = require('node:fs');
const path = require('node:path');
const { buildSync } = require('esbuild');
const root = process.argv[2] || '.next/standalone';
const original = path.join(root, 'next-server.js');
if (!fs.existsSync(original)) fs.renameSync(path.join(root, 'server.js'), original);
fs.copyFileSync('server/next-lifecycle.cjs', path.join(root, 'next-lifecycle.cjs'));
buildSync({ entryPoints: ['server/standalone.ts'], outfile: path.join(root, 'server.js'), bundle: true, platform: 'node', format: 'cjs', target: 'node24', external: ['bufferutil', 'utf-8-validate'], logLevel: 'info' });
