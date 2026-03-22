-- Replace plain text api_keys with hashed keys
TRUNCATE TABLE user_api_keys;

ALTER TABLE user_api_keys DROP COLUMN IF EXISTS api_key;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS key_hash TEXT UNIQUE;
ALTER TABLE user_api_keys ADD COLUMN IF NOT EXISTS key_preview TEXT;

ALTER TABLE user_api_keys ALTER COLUMN key_hash SET NOT NULL;
ALTER TABLE user_api_keys ALTER COLUMN key_preview SET NOT NULL;