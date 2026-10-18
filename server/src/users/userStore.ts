import path from "node:path";

import { getDatabaseUrl, getPgPool } from "../db/pool.js";
import { FileUserStore } from "./fileUserStore.js";
import { PostgresUserStore } from "./postgresUserStore.js";
import type { IUserStore } from "./userStoreTypes.js";

export type { IUserStore } from "./userStoreTypes.js";
export { FileUserStore } from "./fileUserStore.js";
export { PostgresUserStore } from "./postgresUserStore.js";

let singleton: IUserStore | null = null;

export function getUserStore(): IUserStore {
  if (!singleton) {
    if (getDatabaseUrl()) {
      singleton = new PostgresUserStore(getPgPool());
    } else {
      const dir =
        process.env.USER_DATA_DIR?.trim() ||
        path.join(process.cwd(), "data", "users");
      const filePath = path.join(dir, "store.json");
      singleton = new FileUserStore(filePath);
    }
  }
  return singleton;
}

/** Test helper — reset singleton between tests */
export function resetUserStoreForTests(store: IUserStore | null = null): void {
  singleton = store;
}
