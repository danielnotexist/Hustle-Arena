import type { User } from '@supabase/supabase-js';
import type { Profile } from '@hustle-arena/shared-types';
import { serviceRoleClient } from '../lib/supabase';
import { AppError } from '../lib/errors';
import { mapProfile } from '../lib/mappers';
import { asRow, isSupabaseNoRowsError } from '../lib/parsers';

const PROFILE_COLUMNS = [
  'id',
  'username',
  'display_name',
  'avatar_url',
  'bio',
  'steam_handle',
  'country_code',
  'elo_rating',
  'rank_tier',
  'kyc_status',
  'kyc_rejection_reason',
  'is_admin',
  'is_vip',
  'vip_expires_at',
  'total_matches',
  'wins',
  'losses',
  'total_earnings',
  'total_volume',
  'preferred_maps',
  'created_at',
  'updated_at',
].join(', ');

function getSeedUsername(user: User): string {
  const metadata = user.user_metadata;

  if (metadata && typeof metadata.username === 'string' && metadata.username.length > 0) {
    return metadata.username;
  }

  if (user.email) {
    return user.email.split('@')[0] ?? 'player';
  }

  return `player${user.id.slice(0, 6)}`;
}

export async function getProfileById(userId: string, email?: string | null) {
  const { data, error } = await serviceRoleClient
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single();

  if (error) {
    if (isSupabaseNoRowsError(error)) {
      return null;
    }

    throw new AppError(500, 'PROFILE_FETCH_FAILED', error.message);
  }

  return mapProfile(asRow(data), email);
}

export async function ensureProfileForUser(user: User): Promise<Profile> {
  const existingProfile = await getProfileById(user.id, user.email ?? null);

  if (existingProfile) {
    return existingProfile;
  }

  const { data: generatedUsername, error: usernameError } = await serviceRoleClient.rpc('generate_unique_username', {
    raw_seed: getSeedUsername(user),
  });

  if (usernameError) {
    throw new AppError(500, 'PROFILE_USERNAME_FAILED', usernameError.message);
  }

  const username = typeof generatedUsername === 'string' ? generatedUsername : `player${user.id.slice(0, 6)}`;

  const payload = {
    id: user.id,
    username,
    display_name:
      typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.length > 0
        ? user.user_metadata.full_name
        : username,
    avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
    kyc_status: 'pending',
  };

  const { error: insertError } = await serviceRoleClient.from('profiles').insert(payload);

  if (insertError && insertError.code !== '23505') {
    throw new AppError(500, 'PROFILE_CREATE_FAILED', insertError.message);
  }

  const { error: walletError } = await serviceRoleClient.from('wallets').upsert({ user_id: user.id });

  if (walletError) {
    throw new AppError(500, 'WALLET_BOOTSTRAP_FAILED', walletError.message);
  }

  const createdProfile = await getProfileById(user.id, user.email ?? null);

  if (!createdProfile) {
    throw new AppError(500, 'PROFILE_CREATE_FAILED', 'Profile could not be created');
  }

  return createdProfile;
}

export async function updateOwnProfile(
  userId: string,
  input: Partial<Pick<Profile, 'display_name' | 'bio' | 'steam_handle' | 'country_code' | 'preferred_maps'>>,
) {
  const { data, error } = await serviceRoleClient
    .from('profiles')
    .update({
      display_name: input.display_name,
      bio: input.bio,
      steam_handle: input.steam_handle,
      country_code: input.country_code,
      preferred_maps: input.preferred_maps,
    })
    .eq('id', userId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new AppError(500, 'PROFILE_UPDATE_FAILED', error.message);
  }

  return mapProfile(asRow(data));
}
