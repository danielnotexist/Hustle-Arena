import type { Comment, CreatePostInput, Profile } from '@hustle-arena/shared-types';
import { AppError } from '../lib/errors';
import { mapComment, mapPost, mapProfile } from '../lib/mappers';
import { asRow } from '../lib/parsers';
import { serviceRoleClient } from '../lib/supabase';

const POST_SELECT = `
  id,
  user_id,
  content,
  media_urls,
  created_at,
  updated_at,
  author:profiles!posts_user_id_fkey (
    id,
    username,
    display_name,
    avatar_url,
    elo_rating
  )
`;

export async function getPosts(limit = 20) {
  const { data, error } = await serviceRoleClient
    .from('posts')
    .select(POST_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    throw new AppError(500, 'POSTS_FETCH_FAILED', error.message);
  }

  return (data ?? []).map((row) => mapPost(asRow(row)));
}

export async function createPost(userId: string, input: CreatePostInput) {
  const { data, error } = await serviceRoleClient
    .from('posts')
    .insert({
      user_id: userId,
      content: input.content,
      media_urls: input.media_urls ?? [],
    })
    .select(POST_SELECT)
    .single();

  if (error) {
    throw new AppError(500, 'POST_CREATE_FAILED', error.message);
  }

  return mapPost(asRow(data));
}

export async function createComment(userId: string, postId: string, content: string): Promise<Comment> {
  const { data, error } = await serviceRoleClient
    .from('comments')
    .insert({
      post_id: postId,
      user_id: userId,
      content,
    })
    .select('*')
    .single();

  if (error) {
    throw new AppError(500, 'COMMENT_CREATE_FAILED', error.message);
  }

  return mapComment(asRow(data));
}

export async function getFriendProfiles(userId: string): Promise<Profile[]> {
  const { data, error } = await serviceRoleClient
    .from('friends')
    .select('user_id, friend_id, status')
    .eq('status', 'accepted')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) {
    throw new AppError(500, 'FRIENDS_FETCH_FAILED', error.message);
  }

  const friendIds = (data ?? [])
    .map((row) => asRow(row))
    .map((row) => (row.user_id === userId ? row.friend_id : row.user_id))
    .filter((value): value is string => typeof value === 'string' && value.length > 0);

  if (friendIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profilesError } = await serviceRoleClient
    .from('profiles')
    .select(
      'id, username, display_name, avatar_url, bio, steam_handle, country_code, elo_rating, rank_tier, kyc_status, kyc_rejection_reason, is_admin, is_vip, vip_expires_at, total_matches, wins, losses, total_earnings, total_volume, preferred_maps, created_at, updated_at',
    )
    .in('id', friendIds);

  if (profilesError) {
    throw new AppError(500, 'FRIEND_PROFILES_FETCH_FAILED', profilesError.message);
  }

  return (profiles ?? []).map((row) => mapProfile(asRow(row)));
}

export async function sendFriendRequest(userId: string, friendId: string) {
  if (userId === friendId) {
    throw new AppError(400, 'FRIEND_INVALID', 'You cannot add yourself as a friend');
  }

  const { error } = await serviceRoleClient.from('friends').upsert({
    user_id: userId,
    friend_id: friendId,
    status: 'pending',
  });

  if (error) {
    throw new AppError(500, 'FRIEND_REQUEST_FAILED', error.message);
  }
}

export async function acceptFriendRequest(userId: string, friendId: string) {
  const { error: updateError } = await serviceRoleClient
    .from('friends')
    .update({ status: 'accepted' })
    .eq('user_id', friendId)
    .eq('friend_id', userId);

  if (updateError) {
    throw new AppError(500, 'FRIEND_ACCEPT_FAILED', updateError.message);
  }

  const { error: reverseError } = await serviceRoleClient.from('friends').upsert({
    user_id: userId,
    friend_id: friendId,
    status: 'accepted',
  });

  if (reverseError) {
    throw new AppError(500, 'FRIEND_ACCEPT_FAILED', reverseError.message);
  }
}
