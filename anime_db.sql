-- Enable UUID extension for generating unique IDs
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username VARCHAR(50) NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    avatar TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON users 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Create watchlist table
CREATE TABLE IF NOT EXISTS watchlist (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id INTEGER NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_anime_watchlist UNIQUE (user_id, anime_id)
);

-- Create watch history table
CREATE TABLE IF NOT EXISTS watch_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id INTEGER NOT NULL,
    episode_id INTEGER NOT NULL,
    progress NUMERIC(5,2) NOT NULL DEFAULT 0, -- Progress percentage (0-100)
    timestamp_seconds INTEGER NOT NULL DEFAULT 0, -- Playback position in seconds
    last_watched TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_anime_episode UNIQUE (user_id, anime_id, episode_id)
);

-- Create favorites table
CREATE TABLE IF NOT EXISTS favorites (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    anime_id INTEGER NOT NULL,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT unique_user_anime_favorite UNIQUE (user_id, anime_id)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_last_watched ON watch_history(user_id, last_watched DESC);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id ON favorites(user_id);

-- Grant permissions to the anjishnu user (database owner)
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO anjishnu;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO anjishnu;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anjishnu;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anjishnu;

-- Insert a demo user (password is 'password123')
-- The password hash below is bcrypt hash of 'password123'
INSERT INTO users (username, email, password_hash, avatar) 
VALUES (
    'demouser',
    'demo@example.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'https://via.placeholder.com/150'
) ON CONFLICT (email) DO NOTHING;

-- Verification queries to check if everything was created
SELECT 'Tables created successfully' AS status;
SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;
SELECT 'Demo user count: ' || COUNT(*) FROM users WHERE email = 'demo@example.com';
