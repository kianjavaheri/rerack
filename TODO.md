# TODO

## Social: Postgres, Redis and a CDN (on hold until the social features start)

Decided 2026-11-10: keep Firebase for what it does now, and add the social side next to it rather than migrating.

**Keep in Firebase (no change)**
- Sign-in (Apple / Google, one account per email, account deletion with Apple's revoke).
- Personal workout data in Firestore: `CloudRepository`'s offline cache, pending-writes journal and replay are what
  make logging work with no signal in the gym. Supabase has nothing like that built in.
- Short share links (`shares/<id>`).

**Postgres (Supabase) for the social data**
- Tables: profiles (public name, photo, bio), follows, posts (a shared workout, caption, pictures), likes, comments.
- Postgres handles these better than Firestore: feeds ("posts from people I follow"), follower and like counts,
  search by name, joins.
- Auth: let Supabase accept Firebase Auth sign-ins (its third-party auth), so there's one sign-in and row-level
  security uses the Firebase uid. Check Supabase's current docs before committing to it.
- The app never talks to Postgres or Redis behind the user's back; server code (Supabase Edge Functions, Cloud
  Functions or a small API on Cloud Run) handles anything that isn't a plain row-level-secured read or write.
- Account deletion must delete the social data too (App Review), and the privacy policy (`public/privacy.html`)
  must say what's public.

**Pictures and a CDN**
- Today the profile photo is a 256 px data URL inside `Settings.profile`; posts need real file storage.
- Phone shrinks the photo before upload (like `squarePhoto`), uploads to storage (Cloudflare R2 preferred: no download
  fees; or Supabase Storage), a function makes sizes (~320 px thumbnail, ~1080 px feed), served through the CDN.
- Name files by content (`posts/<hash>.webp`), never overwrite, `Cache-Control: public, max-age=31536000, immutable`.
- Private accounts: signed URLs that expire.

**Redis (later, once something is actually slow or costly; Upstash fits serverless)**
- Feeds: a ready-made list of post ids per user (`feed:<userId>`), filled when someone they follow posts.
- Counters: likes and followers with `INCR`, written back to Postgres now and then.
- Leaderboards among friends (sorted sets), rate limits on posting/liking, job queues (image resizing,
  "X liked your workout" notifications).
- Not the source of truth: everything in it can be rebuilt from Postgres.

**Shape**

```
Phone ──► Firebase Auth (sign-in)
      ──► Firestore (your workouts, offline)       ← unchanged
      ──► API / functions ──► Postgres (profiles, follows, posts, likes)
                          └─► Redis (feeds, counts, rate limits)
      ──► CDN ──► R2 / Storage (post pictures, thumbnails)
```

## Android (not started)

Stay on Capacitor (`npx cap add android`): the whole web app runs as is. Native pieces to redo in Kotlin: the
lock-screen rest timer (an ongoing notification), the home-screen widget (Jetpack Glance), haptics and keep-awake
plugins, Health Connect instead of Apple Health, Wear OS optional. Not Flutter or React Native: that's a rewrite, and
the watch, widget and Live Activity would still be Swift.
