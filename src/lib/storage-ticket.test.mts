import test from "node:test";
import assert from "node:assert/strict";
import { signStorageTicket, verifyStorageTicket, type StorageTicket } from "./storage-ticket";
test("storage tickets bind action and metadata; reject tampering, expiry and size bypass", () => {
  const previous = process.env.MOA_STORAGE_SECRET;
  process.env.MOA_STORAGE_SECRET = "storage-test-only-".repeat(4);
  try {
    const now = Date.now();
    const ticket: StorageTicket = { action: "upload", id: "11111111-1111-1111-1111-111111111111", userId: "22222222-2222-2222-2222-222222222222", spaceId: "33333333-3333-3333-3333-333333333333", expires: now + 600000, name: "app.apk", size: 100, version: "1", description: "" };
    const token = signStorageTicket(ticket);
    assert.deepEqual(verifyStorageTicket(token, now), ticket);
    assert.throws(() => verifyStorageTicket(token, now + 600001));
    assert.throws(() => verifyStorageTicket(token + "x", now));
    assert.throws(() => verifyStorageTicket(signStorageTicket({ ...ticket, size: 64 * 1024 * 1024 + 1 }), now));
    assert.throws(() => verifyStorageTicket(signStorageTicket({ ...ticket, id: "../file" }), now));
    assert.throws(() => verifyStorageTicket(signStorageTicket({ ...ticket, name: "app.exe" }), now));
    assert.throws(() => verifyStorageTicket(signStorageTicket({ ...ticket, expires: now + 620000 }), now));
    assert.throws(() => verifyStorageTicket(signStorageTicket({ ...ticket, review: true }), now));
    assert.equal(verifyStorageTicket(signStorageTicket({ ...ticket, action: "download", review: true }), now).review, true);
  } finally { if (previous === undefined) delete process.env.MOA_STORAGE_SECRET; else process.env.MOA_STORAGE_SECRET = previous; }
});
