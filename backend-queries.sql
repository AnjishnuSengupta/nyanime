-- Backend SQL Queries for NyAnime Authentication
-- Use these queries in your Node.js backend

-- 1. REGISTER USER
-- Check if user exists, then insert new user
-- First check:
SELECT id FROM users WHERE email = $1 OR username = $2;

-- If no existing user, insert:
INSERT INTO users (username, email, password_hash, avatar)
VALUES ($1, $2, $3, $4)
RETURNING id, username, email, avatar, created_at;

-- 2. LOGIN USER
-- Get user by email for password verification
SELECT id, username, email, password_hash, avatar, created_at
FROM users 
WHERE email = $1;

-- 3. GET USER BY ID
SELECT id, username, email, avatar, created_at
FROM users 
WHERE id = $1;

-- 4. UPDATE USER PROFILE
UPDATE users 
SET username = COALESCE($2, username),
    avatar = COALESCE($3, avatar),
    updated_at = NOW()
WHERE id = $1
RETURNING id, username, email, avatar, created_at;

-- 5. ADD TO WATCHLIST
INSERT INTO watchlist (user_id, anime_id)
VALUES ($1, $2)
ON CONFLICT (user_id, anime_id) DO NOTHING
RETURNING id, anime_id, added_at;

-- 6. GET USER WATCHLIST
SELECT anime_id, added_at 
FROM watchlist 
WHERE user_id = $1 
ORDER BY added_at DESC;

-- 7. REMOVE FROM WATCHLIST
DELETE FROM watchlist 
WHERE user_id = $1 AND anime_id = $2;

-- 8. UPDATE WATCH HISTORY
INSERT INTO watch_history (user_id, anime_id, episode_id, progress, timestamp_seconds)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (user_id, anime_id, episode_id)
DO UPDATE SET
    progress = EXCLUDED.progress,
    timestamp_seconds = EXCLUDED.timestamp_seconds,
    last_watched = NOW()
RETURNING anime_id, episode_id, progress, timestamp_seconds, last_watched;

-- 9. GET USER WATCH HISTORY
SELECT anime_id, episode_id, progress, timestamp_seconds, last_watched
FROM watch_history
WHERE user_id = $1
ORDER BY last_watched DESC
LIMIT 20;

-- 10. ADD TO FAVORITES
INSERT INTO favorites (user_id, anime_id)
VALUES ($1, $2)
ON CONFLICT (user_id, anime_id) DO NOTHING
RETURNING id, anime_id, added_at;

-- 11. REMOVE FROM FAVORITES
DELETE FROM favorites
WHERE user_id = $1 AND anime_id = $2;

-- 12. GET USER FAVORITES
SELECT anime_id, added_at
FROM favorites
WHERE user_id = $1
ORDER BY added_at DESC;

-- 13. TOGGLE FAVORITE (check if exists first)
-- Check:
SELECT id FROM favorites WHERE user_id = $1 AND anime_id = $2;
-- If exists, delete (query 11), if not exists, add (query 10)
