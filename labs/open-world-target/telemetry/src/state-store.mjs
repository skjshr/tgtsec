import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export class JsonStateStore {
  constructor(filePath) {
    if (!path.isAbsolute(filePath)) {
      throw new Error("state path must be absolute");
    }
    this.filePath = path.resolve(filePath);
  }

  async load() {
    try {
      const contents = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(contents);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error("stored state must be an object");
      }
      return parsed;
    } catch (error) {
      if (error?.code === "ENOENT") return null;
      throw error;
    }
  }

  async save(state) {
    const serialized = `${JSON.stringify(state, null, 2)}\n`;
    if (
      serialized.includes("FLAG{") ||
      /"(?:authTag|command|parameters?|credential|password|token|fileContents?|rawLog)"\s*:/i.test(
        serialized,
      )
    ) {
      throw new Error("refusing to persist forbidden telemetry material");
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporaryPath = `${this.filePath}.tmp-${process.pid}`;
    await writeFile(temporaryPath, serialized, {
      encoding: "utf8",
      mode: 0o600,
    });
    await rename(temporaryPath, this.filePath);
  }
}
