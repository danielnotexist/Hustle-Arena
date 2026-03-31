import type { NextFunction, Request, Response } from 'express';
import type { User } from '@supabase/supabase-js';
import type { Profile } from '@hustle-arena/shared-types';
import { serviceRoleClient } from './supabase';
import { AppError } from './errors';
import { ensureProfileForUser } from '../services/profile-service';

export interface AuthenticatedRequest extends Request {
  auth: {
    user: User;
    profile: Profile;
    accessToken: string;
  };
}

function getBearerToken(request: Request): string {
  const authorization = request.headers.authorization;

  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new AppError(401, 'UNAUTHORIZED', 'Missing bearer token');
  }

  return authorization.slice('Bearer '.length).trim();
}

export async function authenticate(request: Request, _response: Response, next: NextFunction) {
  try {
    const accessToken = getBearerToken(request);
    const { data, error } = await serviceRoleClient.auth.getUser(accessToken);

    if (error || !data.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Invalid Supabase session');
    }

    const profile = await ensureProfileForUser(data.user);

    (request as AuthenticatedRequest).auth = {
      user: data.user,
      profile,
      accessToken,
    };

    next();
  } catch (error) {
    next(error);
  }
}
