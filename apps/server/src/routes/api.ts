import { Router } from 'express';
import { z } from 'zod';
import { MAP_POOL, MATCH_MODES, MATCH_TEAMS, SUPPORTED_NETWORKS, VIP_PLANS } from '@hustle-arena/shared-types';
import type { AuthenticatedRequest } from '../lib/auth';
import { authenticate } from '../lib/auth';
import { env } from '../config/env';
import { asyncHandler, AppError } from '../lib/errors';
import { emitCommunityEvent, emitMatchEvent, emitUserEvent } from '../lib/socket';
import { getInbox, sendMessage } from '../services/chat-service';
import { acceptFriendRequest, createComment, createPost, getFriendProfiles, getPosts, sendFriendRequest } from '../services/community-service';
import { getAdminDashboard, reviewKycSubmission, reviewWithdrawalRequest, updateAdminRole } from '../services/admin-service';
import { getLatestKycSubmission, submitKyc } from '../services/kyc-service';
import { getTopEarners, getTopMatches } from '../services/leaderboard-service';
import {
  castMapVote,
  changeTeam,
  createLobby,
  getLobbyDetails,
  getMatchmakingSnapshot,
  joinLobby,
  joinQueue,
  leaveQueue,
  startMatch,
  submitMatchResult,
  toggleReady,
} from '../services/match-service';
import { updateOwnProfile } from '../services/profile-service';
import {
  getAuditLogs,
  getTransactions,
  getWallet,
  getWithdrawalRequests,
  creditDeposit,
  purchaseVip,
  requestWithdrawal,
} from '../services/wallet-service';

const router = Router();

const profileUpdateSchema = z.object({
  display_name: z.string().trim().min(2).max(32).optional(),
  bio: z.string().trim().max(240).optional(),
  steam_handle: z.string().trim().max(64).optional(),
  country_code: z.string().trim().length(2).optional(),
  preferred_maps: z.array(z.enum(MAP_POOL)).max(MAP_POOL.length).optional(),
});

const kycSchema = z.object({
  legal_name: z.string().trim().min(3).max(80),
  date_of_birth: z.string().trim().min(10).max(10),
  country_code: z.string().trim().length(2),
  document_type: z.string().trim().min(2).max(32),
  document_number: z.string().trim().min(4).max(64),
});

const depositSchema = z.object({
  amount: z.number().positive(),
  network: z.enum(SUPPORTED_NETWORKS),
  tx_hash: z.string().trim().max(128).optional(),
  idempotency_key: z.string().trim().min(8).max(128),
});

const withdrawSchema = z.object({
  amount: z.number().positive(),
  network: z.enum(SUPPORTED_NETWORKS),
  wallet_address: z.string().trim().min(8).max(128),
  idempotency_key: z.string().trim().min(8).max(128),
});

const vipSchema = z.object({
  plan_type: z.enum(VIP_PLANS),
  idempotency_key: z.string().trim().min(8).max(128),
});

const queueSchema = z.object({
  match_mode: z.enum(MATCH_MODES),
  wager_amount: z.number().nonnegative(),
  region: z.string().trim().min(2).max(24),
});

const createLobbySchema = z.object({
  title: z.string().trim().min(2).max(64),
  queue_type: z.enum(['public', 'custom']),
  game_mode: z.enum(MATCH_MODES),
  wager_amount: z.number().nonnegative(),
  region: z.string().trim().min(2).max(24),
  is_private: z.boolean(),
  lobby_password: z.string().trim().min(4).max(24).optional(),
  map_pool: z.array(z.enum(MAP_POOL)).min(1).max(MAP_POOL.length),
});

const joinLobbySchema = z.object({
  password: z.string().trim().min(4).max(24).optional(),
});

const teamSchema = z.object({
  team: z.enum(MATCH_TEAMS),
});

const voteSchema = z.object({
  map_name: z.enum(MAP_POOL),
});

const postSchema = z.object({
  content: z.string().trim().min(3).max(400),
  media_urls: z.array(z.string().url()).max(4).optional(),
});

const commentSchema = z.object({
  content: z.string().trim().min(1).max(280),
});

const friendSchema = z.object({
  friend_id: z.string().uuid(),
});

const messageSchema = z
  .object({
    receiver_id: z.string().uuid().optional(),
    match_id: z.string().uuid().optional(),
    content: z.string().trim().min(1).max(500),
    team_only: z.boolean().optional(),
  })
  .refine((value) => Boolean(value.receiver_id || value.match_id), {
    message: 'A receiver or match id is required',
  });

const matchResultSchema = z.object({
  match_id: z.string().uuid(),
  winner_team: z.enum(['A', 'B']),
  callback_signature: z.string().trim().min(8),
  stats: z.array(
    z.object({
      user_id: z.string().uuid(),
      kills: z.number().int().nonnegative(),
      deaths: z.number().int().nonnegative(),
      assists: z.number().int().nonnegative(),
      adr: z.number().nonnegative(),
      headshot_pct: z.number().min(0).max(100),
    }),
  ),
});

const adminKycReviewSchema = z
  .object({
    status: z.enum(['verified', 'rejected']),
    reason: z.string().trim().max(240).optional(),
    notes: z.string().trim().max(240).optional(),
  })
  .superRefine((value, context) => {
    if (value.status === 'rejected' && !value.reason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejection reason is required',
        path: ['reason'],
      });
    }
  });

const adminWithdrawalReviewSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    tx_hash: z.string().trim().max(128).optional(),
    reason: z.string().trim().max(240).optional(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'reject' && !value.reason?.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejection reason is required',
        path: ['reason'],
      });
    }
  });

const adminRoleSchema = z.object({
  is_admin: z.boolean(),
});

async function broadcastWallet(userId: string) {
  const [wallet, transactions, withdrawals, auditLogs] = await Promise.all([
    getWallet(userId),
    getTransactions(userId),
    getWithdrawalRequests(userId),
    getAuditLogs(userId),
  ]);

  emitUserEvent(userId, 'wallet:update', {
    wallet,
    transactions,
    withdrawals,
    auditLogs,
  });
}

async function broadcastMatch(matchId: string) {
  const snapshot = await getLobbyDetails(matchId);
  emitMatchEvent(matchId, 'match:update', snapshot);

  snapshot.players.forEach((player) => {
    emitUserEvent(player.user_id, 'match:update', snapshot);
  });
}

function requireAdmin(req: AuthenticatedRequest) {
  if (!req.auth.profile.is_admin) {
    throw new AppError(403, 'FORBIDDEN', 'Admin access is required for this action');
  }
}

router.post(
  '/integrations/cs2/match-result',
  asyncHandler(async (req, res) => {
    const sharedSecret = req.header('x-hustle-signature');

    if (!sharedSecret || sharedSecret !== env.cs2CallbackSharedSecret) {
      throw new AppError(401, 'CS2_CALLBACK_UNAUTHORIZED', 'Invalid CS2 callback signature');
    }

    const payload = matchResultSchema.parse(req.body);
    const result = await submitMatchResult(payload);
    await broadcastMatch(payload.match_id);

    result.lobby.players.forEach((player) => {
      void broadcastWallet(player.user_id);
    });

    res.json({ data: result });
  }),
);

router.use(authenticate);

router.get(
  '/admin',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    requireAdmin(req);
    const dashboard = await getAdminDashboard();
    res.json({ data: dashboard });
  }),
);

router.patch(
  '/admin/kyc/:submissionId',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    requireAdmin(req);
    const payload = adminKycReviewSchema.parse(req.body);
    const submission = await reviewKycSubmission(req.auth.user.id, req.params.submissionId, payload);
    emitUserEvent(submission.user_id, 'kyc:update', submission);
    emitUserEvent(submission.user_id, 'profile:update', { kyc_status: submission.status });
    res.json({ data: submission });
  }),
);

router.patch(
  '/admin/withdrawals/:requestId',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    requireAdmin(req);
    const payload = adminWithdrawalReviewSchema.parse(req.body);
    const request = await reviewWithdrawalRequest(req.auth.user.id, req.params.requestId, payload);
    await broadcastWallet(request.user_id);
    emitUserEvent(request.user_id, 'withdrawal:update', request);
    res.json({ data: request });
  }),
);

router.patch(
  '/admin/users/:userId',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    requireAdmin(req);
    const payload = adminRoleSchema.parse(req.body);
    const profile = await updateAdminRole(req.auth.user.id, req.params.userId, payload.is_admin);
    emitUserEvent(profile.id, 'profile:update', profile);
    res.json({ data: profile });
  }),
);

router.get(
  '/bootstrap',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const [wallet, transactions, activeMatches, communityPosts, friends, inbox, topEarners, topMatches] = await Promise.all([
      getWallet(req.auth.user.id),
      getTransactions(req.auth.user.id),
      (await getMatchmakingSnapshot(req.auth.user.id)).openLobbies,
      getPosts(),
      getFriendProfiles(req.auth.user.id),
      getInbox(req.auth.user.id),
      getTopEarners(),
      getTopMatches(),
    ]);

    res.json({
      data: {
        viewer: req.auth.profile,
        wallet,
        transactions,
        activeMatches,
        communityPosts,
        friends,
        inbox,
        topEarners,
        topMatches,
      },
    });
  }),
);

router.patch(
  '/profile',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = profileUpdateSchema.parse(req.body);
    const profile = await updateOwnProfile(req.auth.user.id, payload);
    res.json({ data: profile });
  }),
);

router.get(
  '/kyc',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const submission = await getLatestKycSubmission(req.auth.user.id);
    res.json({ data: submission });
  }),
);

router.post(
  '/kyc',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = kycSchema.parse(req.body);
    const submission = await submitKyc(req.auth.user.id, payload);
    res.json({ data: submission });
  }),
);

router.get(
  '/wallet',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const [wallet, transactions, withdrawals] = await Promise.all([
      getWallet(req.auth.user.id),
      getTransactions(req.auth.user.id),
      getWithdrawalRequests(req.auth.user.id),
    ]);
    const auditLogs = await getAuditLogs(req.auth.user.id);

    res.json({
      data: {
        wallet,
        transactions,
        withdrawals,
        auditLogs,
        deposit_addresses: env.depositAddresses,
      },
    });
  }),
);

router.post(
  '/wallet/deposit',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = depositSchema.parse(req.body);

    if (req.auth.profile.kyc_status !== 'verified') {
      throw new AppError(403, 'KYC_REQUIRED', 'KYC verification is required before deposits are credited');
    }

    const transaction = await creditDeposit(req.auth.user.id, payload);
    await broadcastWallet(req.auth.user.id);
    res.json({ data: transaction });
  }),
);

router.post(
  '/wallet/withdraw',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = withdrawSchema.parse(req.body);

    if (req.auth.profile.kyc_status !== 'verified') {
      throw new AppError(403, 'KYC_REQUIRED', 'KYC verification is required before withdrawals');
    }

    const request = await requestWithdrawal(req.auth.user.id, payload);
    await broadcastWallet(req.auth.user.id);
    res.json({ data: request });
  }),
);

router.post(
  '/wallet/vip',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = vipSchema.parse(req.body);
    const subscription = await purchaseVip(req.auth.user.id, payload);
    await broadcastWallet(req.auth.user.id);
    res.json({ data: subscription });
  }),
);

router.get(
  '/leaderboard',
  asyncHandler(async (_req, res) => {
    const [topEarners, topMatches] = await Promise.all([getTopEarners(), getTopMatches()]);
    res.json({
      data: {
        topEarners,
        topMatches,
      },
    });
  }),
);

router.get(
  '/matchmaking',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const snapshot = await getMatchmakingSnapshot(req.auth.user.id);
    res.json({ data: snapshot });
  }),
);

router.post(
  '/matchmaking/queue',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = queueSchema.parse(req.body);
    const snapshot = await joinQueue(req.auth.user.id, req.auth.profile, payload);

    if (snapshot.activeMatch) {
      await broadcastMatch(snapshot.activeMatch.match.id);
    }

    await broadcastWallet(req.auth.user.id);
    res.json({ data: snapshot });
  }),
);

router.delete(
  '/matchmaking/queue',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    await leaveQueue(req.auth.user.id);
    await broadcastWallet(req.auth.user.id);
    res.status(204).send();
  }),
);

router.post(
  '/matchmaking/lobbies',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = createLobbySchema.parse(req.body);
    const lobby = await createLobby(req.auth.user.id, req.auth.profile, payload);
    await broadcastMatch(lobby.match.id);
    await broadcastWallet(req.auth.user.id);
    res.json({ data: lobby });
  }),
);

router.get(
  '/matchmaking/lobbies/:matchId',
  asyncHandler(async (req, res) => {
    const lobby = await getLobbyDetails(req.params.matchId);
    res.json({ data: lobby });
  }),
);

router.post(
  '/matchmaking/lobbies/:matchId/join',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = joinLobbySchema.parse(req.body);
    const lobby = await joinLobby(req.auth.user.id, req.auth.profile, req.params.matchId, payload.password);
    await broadcastMatch(lobby.match.id);
    await broadcastWallet(req.auth.user.id);
    res.json({ data: lobby });
  }),
);

router.post(
  '/matchmaking/lobbies/:matchId/team',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = teamSchema.parse(req.body);
    const lobby = await changeTeam(req.auth.user.id, req.params.matchId, payload.team);
    await broadcastMatch(lobby.match.id);
    res.json({ data: lobby });
  }),
);

router.post(
  '/matchmaking/lobbies/:matchId/ready',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const lobby = await toggleReady(req.auth.user.id, req.params.matchId);
    await broadcastMatch(lobby.match.id);
    res.json({ data: lobby });
  }),
);

router.post(
  '/matchmaking/lobbies/:matchId/vote',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = voteSchema.parse(req.body);
    const lobby = await castMapVote(req.auth.user.id, req.params.matchId, payload.map_name);
    await broadcastMatch(lobby.match.id);
    res.json({ data: lobby });
  }),
);

router.post(
  '/matchmaking/lobbies/:matchId/start',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const lobby = await startMatch(req.auth.user.id, req.params.matchId);
    await broadcastMatch(lobby.match.id);
    res.json({ data: lobby });
  }),
);

router.get(
  '/community',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const [posts, friends] = await Promise.all([getPosts(), getFriendProfiles(req.auth.user.id)]);
    res.json({
      data: {
        posts,
        friends,
      },
    });
  }),
);

router.post(
  '/community/posts',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = postSchema.parse(req.body);
    const post = await createPost(req.auth.user.id, payload);
    emitCommunityEvent('community:post-created', post);
    res.json({ data: post });
  }),
);

router.post(
  '/community/posts/:postId/comments',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = commentSchema.parse(req.body);
    const comment = await createComment(req.auth.user.id, req.params.postId, payload.content);
    res.json({ data: comment });
  }),
);

router.post(
  '/social/friends',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = friendSchema.parse(req.body);
    await sendFriendRequest(req.auth.user.id, payload.friend_id);
    emitUserEvent(payload.friend_id, 'friends:request', {
      from: req.auth.profile,
    });
    res.status(204).send();
  }),
);

router.post(
  '/social/friends/:friendId/accept',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    await acceptFriendRequest(req.auth.user.id, req.params.friendId);
    emitUserEvent(req.params.friendId, 'friends:accepted', {
      by: req.auth.profile,
    });
    res.status(204).send();
  }),
);

router.get(
  '/chat',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const [inbox, friends] = await Promise.all([getInbox(req.auth.user.id), getFriendProfiles(req.auth.user.id)]);
    res.json({
      data: {
        inbox,
        friends,
      },
    });
  }),
);

router.post(
  '/chat/messages',
  asyncHandler<AuthenticatedRequest>(async (req, res) => {
    const payload = messageSchema.parse(req.body);
    const message = await sendMessage(req.auth.user.id, payload);

    if (message.receiver_id) {
      emitUserEvent(message.receiver_id, 'chat:message', message);
    }

    if (message.match_id) {
      emitMatchEvent(message.match_id, 'chat:message', message);
    }

    emitUserEvent(req.auth.user.id, 'chat:message', message);
    res.json({ data: message });
  }),
);

export { router as apiRouter };
