import type { LeaderboardEntry, TopMatchEntry } from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapLeaderboardEntry, mapTopMatchEntry } from '../lib/mappers';
import { asRow } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

export async function getTopEarners(limit = 10): Promise<LeaderboardEntry[]> {
  const { data, error } = await serviceRoleClient
    .from('profiles')
    .select('id, username, avatar_url, total_earnings')
    .order('total_earnings', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, 'LEADERBOARD_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapLeaderboardEntry(asRow(row)));
}

export async function getTopMatches(limit = 10): Promise<TopMatchEntry[]> {
  const { data, error } = await serviceRoleClient
    .from('matches')
    .select('id, title, wager_amount, total_pool, selected_map, created_at')
    .order('total_pool', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, 'TOP_MATCHES_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapTopMatchEntry(asRow(row)));
}
