// Windows 감독 프로세스가 부모를 종료해도 내부 HTTP 포트를 남기지 않는다.
process.on('disconnect', () => process.exit(0));
