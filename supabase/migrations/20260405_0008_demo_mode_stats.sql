-- 20260405_0008_demo_mode_stats.sql

alter table public.profiles
  add column if not exists demo_stats jsonb not null default '{
    "level": 1,
    "rank": "Demo Cadet",
    "winRate": "0%",
    "kdRatio": 0,
    "headshotPct": "0%",
    "performance": [0,0,0,0,0,0,0,0,0,0]
  }'::jsonb;
