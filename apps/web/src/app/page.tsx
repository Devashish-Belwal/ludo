import { auth } from "@/lib/auth";
import { prisma } from "@ludo/database";
import { SignInButton, SignOutButton } from "@/features/auth/AuthButtons";
import { UsernameCard } from "@/features/profile/UsernameCard";
import { FriendsPanel } from "@/features/friends/FriendsPanel";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await auth();

  // If user is authenticated, query the authoritative user profile from PostgreSQL
  let dbUser = null;
  if (session?.user?.id) {
    dbUser = await prisma.user.findUnique({
      where: { id: session.user.id },
    });
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="border-b border-border bg-card px-6 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Multiplayer Ludo</h1>
            <p className="text-xs text-muted-foreground">
              Server-authoritative real-time web application
            </p>
          </div>
          <div>
            {session?.user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium">
                  {dbUser?.username ? `@${dbUser.username}` : session.user.email}
                </span>
                <SignOutButton />
              </div>
            ) : (
              <SignInButton />
            )}
          </div>
        </div>
      </header>

      {/* Main Grid: Left Panel (Friends), Main Panel (Play / Profile) */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 p-6">
        {session?.user ? (
          <div className="grid w-full grid-cols-1 gap-6 md:grid-cols-12">
            {/* 7.1 Left Panel — Friends (occupies 4 cols on md+) */}
            <aside className="md:col-span-4 lg:col-span-4">
              <FriendsPanel />
            </aside>

            {/* 7.2 Main Panel — Play & Profile (occupies 8 cols on md+) */}
            <main className="space-y-6 md:col-span-8 lg:col-span-8">
              <UsernameCard initialUsername={dbUser?.username ?? null} />

              <div className="rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
                <h2 className="text-lg font-semibold tracking-tight">Play Ludo</h2>
                <p className="text-sm text-muted-foreground">
                  Match with other players online or create a private room with your friends.
                </p>

                <div className="flex flex-wrap gap-4 pt-2">
                  <button
                    disabled={!dbUser?.username}
                    className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Play Public
                  </button>
                  <button
                    disabled={!dbUser?.username}
                    className="inline-flex items-center justify-center rounded-lg border border-border bg-secondary px-5 py-2.5 text-sm font-medium text-secondary-foreground shadow-sm hover:bg-secondary/80 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Invite & Play
                  </button>
                </div>
                {!dbUser?.username && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
                    Please save a unique username above before entering matchmaking or creating rooms.
                  </p>
                )}
              </div>
            </main>
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 shadow-sm text-center space-y-4">
              <h2 className="text-2xl font-bold tracking-tight">Welcome to Ludo</h2>
              <p className="text-sm text-muted-foreground">
                Sign in with your Google account to manage your profile, add friends, and play real-time multiplayer games.
              </p>
              <div className="pt-2">
                <SignInButton />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
