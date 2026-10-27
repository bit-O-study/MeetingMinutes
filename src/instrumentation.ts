export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.MOA_STORAGE_WORKER === "1" && !process.env.VERCEL) {
    const { startStorageWorker } = await import("./lib/storage-worker");
    await startStorageWorker();
  }
}
