import { auth } from "@/lib/auth";
import { prisma } from "@ludo/database";
import { SignInButton, SignOutButton } from "@/features/auth/AuthButtons";
import { UsernameCard } from "@/features/profile/UsernameCard";
import { FriendsPanel } from "@/features/friends/FriendsPanel";
import { PlayLudoSection } from "@/features/rooms/PlayLudoSection";

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

              <PlayLudoSection
                currentUserId={session.user.id}
                username={dbUser?.username ?? null}
              />
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
