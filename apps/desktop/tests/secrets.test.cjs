const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { loadDesktopSecrets } = require("../src/secrets.cjs");

function createFixture() {
  const root = fs.mkdtempSync(
    path.join(os.tmpdir(), "circulo-desktop-secrets-"),
  );
  const userData = path.join(root, "user-data");
  const secretsPath = path.join(userData, "secrets.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`encrypted:${value}`),
    decryptString: (value) => {
      const decrypted = value.toString();
      if (!decrypted.startsWith("encrypted:")) {
        throw new Error("mock secure storage could not decrypt the value");
      }
      return decrypted.slice("encrypted:".length);
    },
  };
  const app = { getPath: () => userData };
  const logger = { warn() {} };

  return {
    app,
    logger,
    root,
    safeStorage,
    secretsPath,
    userData,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
    load: (storage = safeStorage) =>
      loadDesktopSecrets({ app, safeStorage: storage, logger }),
  };
}

test("generated desktop secrets are persisted and reused after restart", (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);

  const firstLaunch = fixture.load();
  const secondLaunch = fixture.load();

  assert.deepEqual(secondLaunch, firstLaunch);
  for (const value of Object.values(firstLaunch)) {
    assert.match(value, /^[0-9a-f]{64}$/);
  }
});

test("a decryption failure preserves the saved file and refuses to rotate keys", (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  fixture.load();
  const originalFile = fs.readFileSync(fixture.secretsPath);
  const brokenStorage = {
    isEncryptionAvailable: () => true,
    decryptString: () => {
      throw new Error("keychain unavailable");
    },
  };

  assert.throws(
    () => fixture.load(brokenStorage),
    /could not decrypt its saved local secret/,
  );
  assert.deepEqual(fs.readFileSync(fixture.secretsPath), originalFile);
});

test("unavailable secure storage preserves existing encrypted secrets", (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  fixture.load();
  const originalFile = fs.readFileSync(fixture.secretsPath);

  assert.throws(
    () => fixture.load({ isEncryptionAvailable: () => false }),
    /operating-system secure storage is unavailable/,
  );
  assert.deepEqual(fs.readFileSync(fixture.secretsPath), originalFile);
});

test("missing secrets with an existing database does not silently create new keys", (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const databasePath = path.join(fixture.userData, "data", "pglite");
  fs.mkdirSync(databasePath, { recursive: true });
  fs.writeFileSync(path.join(databasePath, "data"), "existing database");

  assert.throws(
    () => fixture.load(),
    /existing local database but its secrets file is missing/,
  );
  assert.equal(fs.existsSync(fixture.secretsPath), false);
});

test("first launch without secure storage persists and reuses the generated keys", (t) => {
  const fixture = createFixture();
  t.after(fixture.cleanup);
  const unavailableStorage = { isEncryptionAvailable: () => false };

  const firstLaunch = fixture.load(unavailableStorage);
  const stored = JSON.parse(fs.readFileSync(fixture.secretsPath, "utf8"));
  const secondLaunch = fixture.load(unavailableStorage);

  assert.equal(stored.storageFormat, "plaintext-permissions-v1");
  assert.deepEqual(secondLaunch, firstLaunch);
});
