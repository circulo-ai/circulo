const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const SECRET_NAMES = [
  "BETTER_AUTH_SECRET",
  "ENCRYPTION_KEY",
  "INTERNAL_API_SECRET",
];
const PLAINTEXT_STORAGE_FORMAT = "plaintext-permissions-v1";
const SECRET_VALUE_PATTERN = /^[0-9a-f]{64}$/i;

function secretsError(message, filePath, cause) {
  const error = new Error(
    `${message} The local database and saved secrets were left unchanged. ` +
      `Restore operating-system secure storage or recover ${filePath} from a backup before restarting.`,
  );
  if (cause) error.cause = cause;
  return error;
}

function hasLocalDatabaseData(fileSystem, databasePath) {
  if (!fileSystem.existsSync(databasePath)) return false;
  try {
    return fileSystem.readdirSync(databasePath).length > 0;
  } catch (error) {
    throw new Error(
      `Circulo could not inspect its local database directory: ${error.message}`,
      { cause: error },
    );
  }
}

function writeSecretStore(fileSystem, filePath, contents) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  fileSystem.mkdirSync(path.dirname(filePath), { recursive: true });

  let fileDescriptor;
  try {
    fileDescriptor = fileSystem.openSync(temporaryPath, "w", 0o600);
    fileSystem.writeFileSync(
      fileDescriptor,
      `${JSON.stringify(contents, null, 2)}\n`,
      "utf8",
    );
    fileSystem.fsyncSync(fileDescriptor);
    fileSystem.closeSync(fileDescriptor);
    fileDescriptor = undefined;
    fileSystem.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (fileDescriptor !== undefined) fileSystem.closeSync(fileDescriptor);
    try {
      fileSystem.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error.
    }
    throw new Error(
      `Circulo could not save its local secrets: ${error.message}`,
      {
        cause: error,
      },
    );
  }
}

function generateSecrets() {
  return Object.fromEntries(
    SECRET_NAMES.map((name) => [name, crypto.randomBytes(32).toString("hex")]),
  );
}

function validateSecrets(values, filePath) {
  for (const name of SECRET_NAMES) {
    if (
      typeof values[name] !== "string" ||
      !SECRET_VALUE_PATTERN.test(values[name])
    ) {
      throw secretsError(
        `The saved local secret ${name} is missing or invalid.`,
        filePath,
      );
    }
  }
  return values;
}

function loadDesktopSecrets({
  app,
  safeStorage,
  fileSystem = fs,
  logger = console,
}) {
  const userDataPath = app.getPath("userData");
  const filePath = path.join(userDataPath, "secrets.json");
  const databasePath = path.join(userDataPath, "data", "pglite");
  const fileExists = fileSystem.existsSync(filePath);
  const databaseHasData = hasLocalDatabaseData(fileSystem, databasePath);
  let stored;

  if (fileExists) {
    try {
      stored = JSON.parse(fileSystem.readFileSync(filePath, "utf8"));
    } catch (error) {
      throw secretsError(
        "Circulo could not read its saved local secrets file.",
        filePath,
        error,
      );
    }
    if (!stored || typeof stored !== "object" || Array.isArray(stored)) {
      throw secretsError(
        "Circulo found an invalid saved local secrets file.",
        filePath,
      );
    }

    if (stored.storageFormat === PLAINTEXT_STORAGE_FORMAT) {
      return validateSecrets(stored.values ?? {}, filePath);
    }

    if (!isEncryptionAvailable(safeStorage)) {
      throw secretsError(
        "Circulo found saved secrets, but operating-system secure storage is unavailable.",
        filePath,
      );
    }

    const values = {};
    for (const name of SECRET_NAMES) {
      if (typeof stored[name] !== "string" || !stored[name]) {
        throw secretsError(
          `Circulo found an incomplete saved local secrets file (${name} is missing).`,
          filePath,
        );
      }
      try {
        values[name] = safeStorage.decryptString(
          Buffer.from(stored[name], "base64"),
        );
      } catch (error) {
        throw secretsError(
          `Circulo could not decrypt its saved local secret ${name}.`,
          filePath,
          error,
        );
      }
    }
    return validateSecrets(values, filePath);
  }

  if (databaseHasData) {
    throw secretsError(
      "Circulo found an existing local database but its secrets file is missing.",
      filePath,
    );
  }

  const values = generateSecrets();
  let contents;
  if (isEncryptionAvailable(safeStorage)) {
    try {
      contents = Object.fromEntries(
        SECRET_NAMES.map((name) => [
          name,
          safeStorage.encryptString(values[name]).toString("base64"),
        ]),
      );
    } catch (error) {
      logger.warn(
        "[desktop] OS secure storage failed on first launch; persisting secrets in the per-user application data directory.",
        error,
      );
      contents = {
        storageFormat: PLAINTEXT_STORAGE_FORMAT,
        values,
      };
    }
  } else {
    logger.warn(
      "[desktop] OS secure storage is unavailable on first launch; persisting secrets in the per-user application data directory.",
    );
    contents = {
      storageFormat: PLAINTEXT_STORAGE_FORMAT,
      values,
    };
  }

  writeSecretStore(fileSystem, filePath, contents);
  return values;
}

function isEncryptionAvailable(safeStorage) {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

module.exports = { loadDesktopSecrets };
