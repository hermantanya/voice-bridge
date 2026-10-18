import type { ProfilePatch, UserRecord } from "./profileTypes.js";

export interface IUserStore {
  findById(userId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  getOrCreateByEmail(email: string): Promise<UserRecord>;
  updateProfile(userId: string, patch: ProfilePatch): Promise<UserRecord | null>;
}
