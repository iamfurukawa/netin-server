import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join, resolve } from "node:path";

export class MediaStorage {
  private readonly root: string;

  constructor(path: string) {
    this.root = resolve(path);
  }

  async put(key: string, content: Buffer) {
    const destination = this.pathFor(key);
    await mkdir(this.root, { recursive: true });
    const temporary = `${destination}.part`;
    await writeFile(temporary, content, { mode: 0o600 });
    await rename(temporary, destination);
  }

  stream(key: string) {
    return createReadStream(this.pathFor(key));
  }

  async remove(key: string) {
    await rm(this.pathFor(key), { force: true });
  }

  private pathFor(key: string) {
    if (!/^[a-f0-9-]+\.jpg$/i.test(key)) throw new Error("invalid_media_storage_key");
    return join(this.root, key);
  }
}

export function createMediaStorage(path: string) {
  return new MediaStorage(path);
}
