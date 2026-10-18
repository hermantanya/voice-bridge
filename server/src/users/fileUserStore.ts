import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";

import {
  DEFAULT_USER_PROFILE,
  normalizeEmail,
  type ProfilePatch,
  type UserRecord,
} from "./profileTypes.js";
import type { IUserStore } from "./userStoreTypes.js";

type StoreFile = {
  usersById: Record<string, UserRecord>;
  emailToId: Record<string, string>;
};

function emptyStore(): StoreFile {
  return { usersById: {}, emailToId: {} };
}

export class FileUserStore implements IUserStore {
  private data: StoreFile = emptyStore();
  private loaded = false;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await mkdir(path.dirname(this.filePath), { recursive: true });

    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as StoreFile;
      this.data = {
        usersById: parsed.usersById ?? {},
        emailToId: parsed.emailToId ?? {},
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        throw error;
      }
      this.data = emptyStore();
      await this.persist();
    }

    this.loaded = true;
  }

  private persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      const tmpPath = `${this.filePath}.tmp`;
      const payload = JSON.stringify(this.data, null, 2);
      await writeFile(tmpPath, payload, "utf8");
      await rename(tmpPath, this.filePath);
    });
    return this.writeChain;
  }

  async findById(userId: string): Promise<UserRecord | null> {
    await this.ensureLoaded();
    return this.data.usersById[userId] ?? null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    await this.ensureLoaded();
    const id = this.data.emailToId[normalizeEmail(email)];
    if (!id) {
      return null;
    }
    return this.data.usersById[id] ?? null;
  }

  async getOrCreateByEmail(email: string): Promise<UserRecord> {
    await this.ensureLoaded();
    const normalized = normalizeEmail(email);
    const existingId = this.data.emailToId[normalized];
    if (existingId && this.data.usersById[existingId]) {
      return this.data.usersById[existingId];
    }

    const now = new Date().toISOString();
    const user: UserRecord = {
      id: randomUUID(),
      email: normalized,
      profile: { ...DEFAULT_USER_PROFILE },
      createdAt: now,
      updatedAt: now,
    };

    this.data.usersById[user.id] = user;
    this.data.emailToId[normalized] = user.id;
    await this.persist();
    return user;
  }

  async updateProfile(
    userId: string,
    patch: ProfilePatch,
  ): Promise<UserRecord | null> {
    await this.ensureLoaded();
    const user = this.data.usersById[userId];
    if (!user) {
      return null;
    }

    user.profile = {
      ...user.profile,
      ...patch,
    };
    user.updatedAt = new Date().toISOString();
    await this.persist();
    return user;
  }
}
