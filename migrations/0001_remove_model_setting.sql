-- Migration: Remove model_setting_json from generation_profiles
-- Model name is now read from environment variable LLM_MODEL_DEFAULT

-- SQLite doesn't support DROP COLUMN directly before 3.35.0
-- We need to recreate the table

-- Step 1: Create new table without model_setting_json
CREATE TABLE generation_profiles_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    topic_preference TEXT NOT NULL,
    concurrency INTEGER NOT NULL,
    timeout_ms INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    updated_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
    CHECK (concurrency > 0),
    CHECK (timeout_ms > 0)
);

-- Step 2: Copy data from old table (excluding model_setting_json)
INSERT INTO generation_profiles_new (id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at)
SELECT id, name, topic_preference, concurrency, timeout_ms, created_at, updated_at
FROM generation_profiles;

-- Step 3: Drop old table
DROP TABLE generation_profiles;

-- Step 4: Rename new table to original name
ALTER TABLE generation_profiles_new RENAME TO generation_profiles;

-- Step 5: Recreate indexes
CREATE UNIQUE INDEX uq_generation_profiles_name ON generation_profiles(name);
CREATE INDEX idx_generation_profiles_topic_preference ON generation_profiles(topic_preference);
