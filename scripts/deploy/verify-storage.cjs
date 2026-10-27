/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const crypto = require('node:crypto');
const path = require('node:path');
const id = process.env.FILE_ID, expected = process.env.FILE_SHA256;
if (!/^[a-f0-9-]{36}$/.test(id || '') || !/^[a-f0-9]{64}$/.test(expected || '')) throw Error('Invalid verification input');
const root = 'C:/services/Bit-O/MeetingMinutes/data/uploads';
const target = path.join(root, id);
const bytes = fs.readFileSync(target);
const actual = crypto.createHash('sha256').update(bytes).digest('hex');
if (actual !== expected) throw Error('Stored file digest mismatch; no cleanup performed');
console.log(JSON.stringify({ persistentDisk: root, bytes: bytes.length, sha256: actual, verified: true }));
if (process.env.CLEANUP === 'true') { fs.unlinkSync(target); console.log('Verified temporary fixture removed from server disk.'); }
