import dotenv from 'dotenv';

dotenv.config();

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export const env = {
  port: Number(process.env.PORT ?? '3001'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  supabaseUrl: getRequiredEnv('SUPABASE_URL'),
  supabaseAnonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
  supabaseServiceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
  cs2CallbackSharedSecret: getRequiredEnv('CS2_CALLBACK_SHARED_SECRET'),
  autoApproveKyc: process.env.AUTO_APPROVE_KYC === 'true',
  depositAddresses: {
    TRC20: getRequiredEnv('DEPOSIT_ADDRESS_TRC20'),
    BEP20: getRequiredEnv('DEPOSIT_ADDRESS_BEP20'),
  },
};
