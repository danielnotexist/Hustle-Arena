const path = require('path')
const dotenv = require('dotenv')
const { createClient } = require('@supabase/supabase-js')

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the repo root .env file.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

function readArg(name) {
  const index = process.argv.indexOf(`--${name}`)

  if (index === -1) {
    return undefined
  }

  return process.argv[index + 1]
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`)
}

function printUsage() {
  console.log('Usage:')
  console.log('  npm run user:manage -- --email you@example.com --password "StrongPass123!" --username arenauser --display-name "Arena User" [--admin] [--reset-password]')
}

async function findUserByEmail(email) {
  let page = 1

  while (page <= 20) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 100,
    })

    if (error) {
      throw error
    }

    const user = (data.users ?? []).find((entry) => entry.email?.toLowerCase() === email.toLowerCase())

    if (user) {
      return user
    }

    if (!data.users || data.users.length < 100) {
      return null
    }

    page += 1
  }

  return null
}

async function ensureProfile(user, options) {
  const { data: existingProfile, error: existingProfileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, is_admin, kyc_status')
    .eq('id', user.id)
    .maybeSingle()

  if (existingProfileError) {
    throw existingProfileError
  }

  const usernameSeed = options.username || existingProfile?.username || user.user_metadata?.username || user.email?.split('@')[0] || `player${user.id.slice(0, 6)}`
  let username = existingProfile?.username

  if (!username) {
    const { data: generatedUsername, error: usernameError } = await supabase.rpc('generate_unique_username', {
      raw_seed: usernameSeed,
    })

    if (usernameError) {
      throw usernameError
    }

    username = typeof generatedUsername === 'string' && generatedUsername.length > 0 ? generatedUsername : usernameSeed
  }

  const displayName = options.displayName || existingProfile?.display_name || user.user_metadata?.full_name || username
  const isAdmin = typeof options.admin === 'boolean' ? options.admin : existingProfile?.is_admin || false

  const { error: profileError } = await supabase.from('profiles').upsert({
    id: user.id,
    username,
    display_name: displayName,
    avatar_url: typeof user.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url : null,
    kyc_status: existingProfile?.kyc_status || 'pending',
    is_admin: isAdmin,
  })

  if (profileError) {
    throw profileError
  }

  const { error: walletError } = await supabase.from('wallets').upsert({ user_id: user.id })

  if (walletError) {
    throw walletError
  }

  const { data: profile, error: fetchError } = await supabase
    .from('profiles')
    .select('id, username, display_name, is_admin, kyc_status')
    .eq('id', user.id)
    .single()

  if (fetchError) {
    throw fetchError
  }

  return profile
}

async function main() {
  const email = readArg('email')
  const password = readArg('password')
  const username = readArg('username')
  const displayName = readArg('display-name')
  const admin = hasFlag('admin') ? true : undefined
  const resetPassword = hasFlag('reset-password')

  if (!email) {
    printUsage()
    throw new Error('Missing required --email argument.')
  }

  let user = await findUserByEmail(email)

  if (!user) {
    if (!password) {
      printUsage()
      throw new Error('A password is required when creating a new user.')
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        username: username || email.split('@')[0],
        full_name: displayName || username || email.split('@')[0],
      },
    })

    if (error || !data.user) {
      throw error || new Error('User creation failed.')
    }

    user = data.user
  } else if (password && resetPassword) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      password,
      user_metadata: {
        ...user.user_metadata,
        username: username || user.user_metadata?.username || email.split('@')[0],
        full_name: displayName || user.user_metadata?.full_name || username || email.split('@')[0],
      },
    })

    if (error || !data.user) {
      throw error || new Error('Password reset failed.')
    }

    user = data.user
  } else if ((username || displayName) && user.id) {
    const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...user.user_metadata,
        username: username || user.user_metadata?.username || email.split('@')[0],
        full_name: displayName || user.user_metadata?.full_name || username || email.split('@')[0],
      },
    })

    if (error || !data.user) {
      throw error || new Error('User metadata update failed.')
    }

    user = data.user
  }

  const profile = await ensureProfile(user, {
    username,
    displayName,
    admin,
  })

  console.log(JSON.stringify({
    email,
    userId: user.id,
    username: profile.username,
    displayName: profile.display_name,
    isAdmin: profile.is_admin,
    kycStatus: profile.kyc_status,
    passwordSet: Boolean(password),
  }, null, 2))
}

main().catch((error) => {
  console.error(error.message || error)
  process.exit(1)
})
