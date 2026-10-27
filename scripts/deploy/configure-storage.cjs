/* eslint-disable @typescript-eslint/no-require-imports */
// GitHub 암호화 secret에서만 읽고 값은 출력하지 않는다.
const fs = require('node:fs');
const path = require('node:path');
const { parseEnv } = require('node:util');
const root = 'C:/services/Bit-O/MeetingMinutes';
if (process.env.GITHUB_REPOSITORY !== 'bit-O-study/MeetingMinutes' || process.env.GITHUB_REF !== 'refs/heads/main') throw Error('Only main can configure storage');
const config = path.join(root, 'config/runtime.env');
const incoming = parseEnv(process.env.MOA_RUNTIME_ENV || '');
if (!incoming.DATABASE_URL || !incoming.AUTH_SECRET || incoming.MOA_STORAGE_WORKER !== '1') throw Error('Missing storage runtime secret');
const previous = fs.existsSync(config) ? parseEnv(fs.readFileSync(config, 'utf8')) : {};
const values = { ...previous, ...incoming };
function serialize(values) {
  return Object.entries(values).map(([key, value]) => {
    const quote = ["'", '"', '`'].find(q => !value.includes(q));
    if (!quote) throw Error('Unsupported environment value');
    return key + '=' + quote + value + quote;
  }).join('\n') + '\n';
}
fs.mkdirSync(path.dirname(config), { recursive: true });
fs.mkdirSync(incoming.MOA_UPLOAD_DIR, { recursive: true });
fs.mkdirSync(path.dirname(incoming.MOA_CLOUDFLARED_PATH), { recursive: true });
if (!fs.existsSync(incoming.MOA_CLOUDFLARED_PATH)) fs.copyFileSync('C:/services/Bit-O/access/bin/cloudflared.exe', incoming.MOA_CLOUDFLARED_PATH);
fs.writeFileSync(config + '.tmp', serialize(values), { mode: 0o600 });
fs.renameSync(config + '.tmp', config);
console.log('Persistent storage runtime configured; credentials omitted.');
