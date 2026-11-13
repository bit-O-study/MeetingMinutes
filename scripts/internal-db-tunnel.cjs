/* eslint-disable @typescript-eslint/no-require-imports */
// DB 포트는 공개하지 않고 SSH의 루프백 포워딩으로만 개발 PC에 연결한다.
const { config } = require('dotenv');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
config({ path: ['.env.local', '.env'], quiet: true });
const env = process.env;
const ensure = process.argv.includes('--ensure');
if (!env.DATABASE_SSH_HOST) {
  if (!ensure) { console.error('DATABASE_SSH_HOST 설정이 필요합니다.'); process.exitCode = 1; }
} else {
  const port = Number(env.DATABASE_SSH_LOCAL_PORT || 15433);
  const remotePort = Number(env.DATABASE_SSH_REMOTE_PORT || 5433);
  if (![port, remotePort].every(p => Number.isInteger(p) && p > 0 && p < 65536)) throw Error('DB 터널 포트를 확인해 주세요.');
  const args = ['-N', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', '-o', 'ExitOnForwardFailure=yes', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'StrictHostKeyChecking=yes'];
  if (env.DATABASE_SSH_HOST_KEY_ALIAS) args.push('-o', 'HostKeyAlias=' + env.DATABASE_SSH_HOST_KEY_ALIAS);
  if (env.DATABASE_SSH_KEY) args.push('-i', env.DATABASE_SSH_KEY);
  args.push('-L', `127.0.0.1:${port}:127.0.0.1:${remotePort}`, `${env.DATABASE_SSH_USER || 'pc'}@${env.DATABASE_SSH_HOST}`);
  const listening = () => new Promise(resolve => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.setTimeout(500);
    const done = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => done(true)); socket.once('error', () => done(false)); socket.once('timeout', () => done(false));
  });
  (async () => {
    if (ensure && await listening()) { console.log(`내부 DB 터널 준비됨 (127.0.0.1:${port})`); return; }
    if (!ensure) {
      let closing = false, active;
      const stop = () => { closing = true; active?.kill(); };
      process.once('SIGINT', stop); process.once('SIGTERM', stop);
      // VPN이나 서버 연결이 잠깐 끊겨도 다음 요청을 위해 터널을 다시 연다.
      while (!closing) {
        await new Promise(resolve => {
          active = spawn('ssh', args, { stdio: 'inherit', windowsHide: true });
          active.once('error', () => { console.error('SSH를 실행하지 못했습니다.'); resolve(); });
          active.once('exit', resolve);
        });
        if (!closing) { console.log('내부 DB 터널 재연결 중…'); await new Promise(resolve => setTimeout(resolve, 3000)); }
      }
      return;
    }
    const directory = path.resolve('.data/db-tunnel'); fs.mkdirSync(directory, { recursive: true });
    const log = fs.openSync(path.join(directory, 'ssh.log'), 'a');
    const child = spawn(process.execPath, [__filename], { detached: true, stdio: ['ignore', log, log], windowsHide: true });
    fs.closeSync(log); let spawnError = false;
    child.on('error', () => { spawnError = true; }); child.unref();
    for (let i = 0; i < 30 && !spawnError; i++) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (await listening()) {
        fs.writeFileSync(path.join(directory, 'process.json'), JSON.stringify({ pid: child.pid, port, startedAt: new Date().toISOString() }));
        console.log(`내부 DB 터널 연결됨 (127.0.0.1:${port})`); return;
      }
    }
    child.kill(); throw Error('내부 DB SSH 연결에 실패했습니다. .data/db-tunnel/ssh.log와 서버 연결을 확인해 주세요.');
  })().catch(error => { console.error(error.message); process.exitCode = 1; });
}
