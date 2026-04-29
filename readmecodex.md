# Codex Working Log

מטרת הקובץ:
לשמור רצף עבודה ברור בין דניאל, חברי צוות, ו־AI agents נוספים.
כל מי שממשיך לעבוד על הפרויקט צריך לקרוא את הקובץ הזה לפני שינוי קוד, ולעדכן אותו אחרי כל משימה משמעותית.

## Current Project State

- Project path: `/Users/danielcohen/Desktop/Projects/Hustle-Arena/test-google-studio`
- Active local branch right now: `main`
- `main` עודכן מקומית מול `origin/main` בתאריך `2026-04-29`
- Local `preview` branch קיים ומעודכן מול `origin/preview`
- יש שינוי מקומי קיים ב־`package-lock.json` שצריך לקחת בחשבון לפני checkout / reset / stash

## Recent Context

- בוצע `git fetch --all --prune`
- בוצע עדכון מקומי של `preview` מה־remote
- בוצע `pull` ל־`main` עם `--autostash --ff-only`
- הפרויקט קיבל עדכונים משמעותיים שקשורים ל־Railway בתור backend בגלל עומס על Vercel
- נוספו תיקיות וקבצים רלוונטיים כגון:
  - `backend/`
  - `railway.json`
  - `docs/railway-backend-migration.md`
  - `supabase/migrations/`
  - שינויים רחבים ב־`src/`

## Working Agreement

- לפני תחילת עבודה: לקרוא את הקובץ הזה ואת `docs/railway-backend-migration.md`
- לא לבצע פקודות הרסניות כמו `git reset --hard` או `git checkout --` בלי אישור מפורש
- לא לדרוס את `package-lock.json` בלי לבדוק אם השינוי המקומי עדיין נדרש
- אחרי כל תיקון באג משמעותי:
  - לעדכן מה תוקן
  - לציין אילו קבצים השתנו
  - לציין איך אימתנו את התיקון
  - לציין אם נשארו סיכונים או TODOs

## Task Log

### 2026-04-29

#### Railway hot-path migration

- Added Railway API ownership for initial high-traffic flows:
  - direct message thread reads, sends, and unread counts
  - pending lobby invites and lobby invite responses
  - notification reads and batch mark-as-read
  - quick queue party invite list, send, and respond actions
- Frontend now routes these flows through Railway when `VITE_API_BASE_URL` is configured
- Frontend still falls back to direct Supabase calls when no Railway API base URL is configured
- Verification: `npm run check` passed

#### Railway production deploy follow-up

- Found that Vercel had frontend code from `main`, while Railway production was still serving an older `preview` deployment
- Symptom: browser console showed repeated 404s for `/api/social/notifications` and `/api/matchmaking/party-invites`
- Manually deployed current code to Railway production with `railway up`
- Added client fallback so Railway hot-path calls are used only when a Supabase bearer token is available; otherwise the app uses the existing Supabase path instead of producing 401 noise
- Verification: Railway `/health` returned 200 and new hot-path endpoints returned 401 instead of 404 when called without auth
- Verification: `npm run check` passed

#### Railway fallback hardening

- Browser console still showed errors when Railway returned 401 for hot-path endpoints
- Updated social and matchmaking client calls so Railway is only an acceleration path
- If Railway returns non-OK or the request fails, the app silently falls back to the existing Supabase path instead of breaking notifications, invites, or direct messages
- Verification: `npm run check` passed

#### Hot-path stabilization switch

- Disabled Railway hot-path client routing by default behind `VITE_ENABLE_RAILWAY_HOT_PATHS=true`
- This keeps the deployed Railway backend available, but routes production social/invite/notification traffic through the stable Supabase path unless the flag is explicitly enabled
- Reason: production browser sessions were still producing Railway 401s and breaking user-facing flows

#### Repository sync

- אותר שה־repo האמיתי נמצא בתוך `test-google-studio`
- `main` עודכן מ־`8705140` ל־`ddf126e`
- `preview` נמשך מקומית ונוצר כבראנץ' מקומי
- השינוי המקומי ב־`package-lock.json` נשמר במהלך ה־pull

#### Key infra direction

- המערכת מתקדמת לכיוון שבו Railway משמש גם כ־backend
- Vercel נשאר חלק מהמערך, אבל לא מחזיק לבדו את העומס
- יש בסיס backend חדש שצריך לבדוק בזמן תיקוני באגים, במיוחד בנתיבי auth, wallet, steam, missions, ושרתים

## Next Session Checklist

- לאסוף רשימת באגים נוכחית מדניאל
- למפות אם כל באג שייך ל־frontend, backend, Supabase, auth, או deployment
- לבדוק אם יש צורך בהרצת dev ל־frontend או backend לפני תיקון
- לעדכן את הקובץ הזה אחרי כל משימה משמעותית

## Performance Direction

- יעד המוצר כרגע: לשפר את החלקות והעמידות של הפלטפורמה תחת עומס גבוה
- היעד התפעולי: להעביר ל־Railway את כל הזרימות שדורשות תזמור שרתי, הגנות עומס, secrets, retries, או קואורדינציה רגישה
- לא כל פעולה חייבת לעבור ל־Railway:
  - קריאות read פשוטות יכולות להישאר ב־Supabase אם הן כבר מהירות ויציבות
  - פעולות חמות, polling כבד, fan-out, והודעות/הזמנות הן מועמדות חזקות לבעלות שרתית

## Priority Migration Order For Scale

### Phase 1: hottest interactive flows

- direct messages
- lobby invites
- quick queue party invites
- notifications fan-out / unread sync
- session/bootstrap paths שיש בהם polling או retries מיותרים

### Phase 2: orchestration-heavy game flows

- quick queue match orchestration
- ready check lifecycle
- lobby state refresh
- reconnect / resume state
- server allocation / match bootstrap coordination

### Phase 3: reliability and observability

- request metrics
- slow endpoint logging
- queue latency metrics
- background jobs and cleanup on Railway worker/scheduler
- backpressure / rate limiting / abuse guards

## Why Move Hot Flows To Railway

- כדי להוריד orchestration כבד מהדפדפן
- כדי לצמצם polling אגרסיבי של הרבה לקוחות במקביל
- כדי לבצע batching, dedupe, retries, ו־fan-out במקום אחד
- כדי לא לחשוף לוגיקה רגישה או secrets
- כדי להוסיף rate limit, caching, queueing, ו־instrumentation

## Scaling Rule Of Thumb

- Vercel צריך להגיש UI ו־static assets
- Supabase צריך להיות מקור האמת של נתונים, auth, RPC, ו־realtime
- Railway צריך להחזיק זרימות חמות שמייצרות הרבה תעבורה, תזמור, או עבודה חוזרת
- כל flow חדש צריך להישאל:
  - האם זה read פשוט?
  - האם זה write רגיש?
  - האם זה action שחוזר הרבה אצל הרבה משתמשים?
  - האם זה flow עם retries / polling / fan-out / side effects?
  - אם כן, כנראה צריך בעלות של Railway

## Current Execution Decision

- נתחיל מלצמצם עומס במסלולים הבאים:
  - direct messages
  - party invites
  - lobby invites
  - notifications refresh
- במקביל נבדוק את ה־hotspots ב־`quick-match-view.tsx`, `battlefield-view.tsx`, ו־`App.tsx`
- כל שינוי כזה חייב להגיע עם:
  - ירידה בכמות הקריאות מהלקוח
  - פחות polling
  - פחות duplicate fetches
  - ולידציה שה־UI נשאר עקבי

## Update Template

להדביק בסוף הקובץ אחרי כל משימה:

### YYYY-MM-DD

#### Task

- מה ניסינו לפתור

#### Changes

- אילו קבצים שונו
- מה השתנה בפועל

#### Verification

- אילו בדיקות/הרצות בוצעו
- מה עבר ומה לא נבדק

#### Open Items

- מה עדיין נשאר פתוח
