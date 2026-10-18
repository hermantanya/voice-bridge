import { randomUUID } from "node:crypto";
import type pg from "pg";

import {
  DEFAULT_USER_PROFILE,
  normalizeEmail,
  type LanguageCode,
  type ProfilePatch,
  type SpeakerGender,
  type UserProfile,
  type UserRecord,
} from "./profileTypes.js";
import type { IUserStore } from "./userStoreTypes.js";

type UserRow = {
  id: string;
  email: string;
  hear_lang: string;
  speaker_gender: string;
  elevenlabs_voice_id: string | null;
  created_at: Date;
  updated_at: Date;
};

function rowToRecord(row: UserRow): UserRecord {
  const profile: UserProfile = {
    hearLang: row.hear_lang as LanguageCode,
    speakerGender: row.speaker_gender as SpeakerGender,
    elevenlabsVoiceId: row.elevenlabs_voice_id,
  };
  return {
    id: row.id,
    email: row.email,
    profile,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export class PostgresUserStore implements IUserStore {
  constructor(private readonly pool: pg.Pool) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, hear_lang, speaker_gender, elevenlabs_voice_id, created_at, updated_at
       FROM users WHERE id = $1`,
      [userId],
    );
    const row = result.rows[0];
    return row ? rowToRecord(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const normalized = normalizeEmail(email);
    const result = await this.pool.query<UserRow>(
      `SELECT id, email, hear_lang, speaker_gender, elevenlabs_voice_id, created_at, updated_at
       FROM users WHERE LOWER(email) = $1`,
      [normalized],
    );
    const row = result.rows[0];
    return row ? rowToRecord(row) : null;
  }

  async getOrCreateByEmail(email: string): Promise<UserRecord> {
    const normalized = normalizeEmail(email);
    const existing = await this.findByEmail(normalized);
    if (existing) {
      return existing;
    }

    const id = randomUUID();
    const profile = { ...DEFAULT_USER_PROFILE };
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, hear_lang, speaker_gender, elevenlabs_voice_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO NOTHING
       RETURNING id, email, hear_lang, speaker_gender, elevenlabs_voice_id, created_at, updated_at`,
      [
        id,
        normalized,
        profile.hearLang,
        profile.speakerGender,
        profile.elevenlabsVoiceId,
      ],
    );

    if (result.rows[0]) {
      return rowToRecord(result.rows[0]);
    }

    const afterConflict = await this.findByEmail(normalized);
    if (!afterConflict) {
      throw new Error("Failed to create or load user by email");
    }
    return afterConflict;
  }

  async updateProfile(
    userId: string,
    patch: ProfilePatch,
  ): Promise<UserRecord | null> {
    const current = await this.findById(userId);
    if (!current) {
      return null;
    }

    const nextProfile = { ...current.profile, ...patch };
    const result = await this.pool.query<UserRow>(
      `UPDATE users
       SET hear_lang = $2,
           speaker_gender = $3,
           elevenlabs_voice_id = $4,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, email, hear_lang, speaker_gender, elevenlabs_voice_id, created_at, updated_at`,
      [
        userId,
        nextProfile.hearLang,
        nextProfile.speakerGender,
        nextProfile.elevenlabsVoiceId,
      ],
    );
    const row = result.rows[0];
    return row ? rowToRecord(row) : null;
  }
}
