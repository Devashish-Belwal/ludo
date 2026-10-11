import { auth } from "@/lib/auth";
import { prisma } from "@ludo/database";
import { SignInButton, SignOutButton } from "@/features/auth/AuthButtons";
import { UsernameCard } from "@/features/profile/UsernameCard";

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
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground">
      <main className="w-full max-w-2xl space-y-6">
        <header className="flex items-center justify-between rounded-xl border border-border bg-card p-6 shadow-sm">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Multiplayer Ludo</h1>
            <p className="text-sm text-muted-foreground">
              Real-time multiplayer web application
            </p>
          </div>
          <div>
            {session?.user ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {session.user.email}
                </span>
                <SignOutButton />
              </div>
            ) : (
              <SignInButton />
            )}
          </div>
        </header>

        {session?.user ? (
          <UsernameCard initialUsername={dbUser?.username ?? null} />
        ) : (
          <div className="rounded-xl border border-border bg-card p-8 shadow-sm text-center">
            <h2 className="text-xl font-semibold mb-2">Welcome to Multiplayer Ludo</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Sign in with your Google account to create your player profile and start playing.
            </p>
            <SignInButton />
          </div>
        )}
      </main>
    </div>
  );
}
