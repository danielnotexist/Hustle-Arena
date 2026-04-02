-- Create users profile table (optional, Supabase Auth handles users, but this stores extra info)
-- Note: Supabase Auth.users is the source of truth for auth.
-- This table can be used to store additional metadata if you prefer a separate table.

-- Create missions table
CREATE TABLE missions (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  reward INTEGER NOT NULL,
  difficulty TEXT NOT NULL,
  time_left TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Seed missions
INSERT INTO missions (title, reward, difficulty, time_left) VALUES 
('Data Heist', 500, 'Hard', '2h left'),
('Nexus Defense', 200, 'Easy', '5h left'),
('Silent Assassin', 1200, 'Extreme', '12h left');

-- Enable Row Level Security (RLS)
ALTER TABLE missions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow everyone to read missions
CREATE POLICY "Allow public read access" ON missions FOR SELECT USING (true);
