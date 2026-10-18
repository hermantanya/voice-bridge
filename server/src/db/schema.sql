-- Voice Bridge user accounts (v1.4 phase 1 profile fields).
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  hear_lang TEXT NOT NULL DEFAULT 'en',
  speaker_gender TEXT NOT NULL DEFAULT 'female',
  elevenlabs_voice_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT users_hear_lang_check CHECK (hear_lang IN ('en', 'he', 'ru')),
  CONSTRAINT users_speaker_gender_check CHECK (speaker_gender IN ('female', 'male'))
);

CREATE INDEX IF NOT EXISTS users_email_lower_idx ON users (LOWER(email));
