import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import { Strategy as SteamStrategy } from 'passport-steam';
import jwt from 'jsonwebtoken';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

// Supabase Setup
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseJwtSecret = process.env.SUPABASE_JWT_SECRET!;
const supabase = createClient(supabaseUrl, supabaseServiceRole);

// Passport Setup
passport.serializeUser((user, done) => {
  done(null, user);
});

passport.deserializeUser((obj: any, done) => {
  done(null, obj);
});

passport.use(new SteamStrategy({
  returnURL: `${process.env.BACKEND_URL || `http://localhost:${port}`}/api/auth/steam/return`,
  realm: `${process.env.BACKEND_URL || `http://localhost:${port}`}/`,
  apiKey: process.env.STEAM_API_KEY!
}, async (identifier: string, profile: any, done: any) => {
  try {
    const steamId = profile.id;
    
    // 1. Find or Create User in Supabase
    // We'll store the steam_id in a custom column in profiles table
    let { data: userProfile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('steam_id', steamId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows found"
      throw error;
    }

    if (!userProfile) {
      // Create a new user in Supabase Auth (or just a profile)
      // For simplicity, we create a profile. In a real app, you might want to link to a Supabase User.
      // Since we can't easily "sign in" via OpenID to Supabase Auth, 
      // we'll use a custom JWT strategy.
      
      const { data: newUser, error: createError } = await supabase
        .from('profiles')
        .insert([
          { 
            steam_id: steamId, 
            username: profile.displayName, 
            avatar_url: profile._json.avatarfull,
            elo_rating: 1000 // Default ELO
          }
        ])
        .select()
        .single();

      if (createError) throw createError;
      userProfile = newUser;
    }

    return done(null, userProfile);
  } catch (err) {
    return done(err);
  }
}));

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
}));
app.use(morgan('dev'));
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'hustle-arena-secret',
  resave: true,
  saveUninitialized: true
}));
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Steam Auth Routes
app.get('/api/auth/steam', passport.authenticate('steam'));

app.get('/api/auth/steam/return', 
  passport.authenticate('steam', { failureRedirect: '/' }),
  (req, res) => {
    const user = req.user as any;
    
    // Generate Supabase-compatible JWT
    // The "sub" should be a unique identifier. 
    // In Supabase, this is usually the auth.users.id.
    // If we only use profiles, we can use the profile id.
    const payload = {
      sub: user.id,
      email: `${user.steam_id}@steam.com`, // Fake email for Supabase compatibility
      role: 'authenticated',
      app_metadata: {},
      user_metadata: {
        steam_id: user.steam_id,
        username: user.username
      },
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24 * 7) // 1 week
    };

    const token = jwt.sign(payload, supabaseJwtSecret);

    // Redirect back to frontend with the token
    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
    res.redirect(`${frontendUrl}/login?token=${token}`);
  }
);

// Start Server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
