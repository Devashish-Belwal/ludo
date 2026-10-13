import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { prisma } from "@ludo/database";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "tI3qpPrP9ObUznnT7+NspZWU0iMstkoOal/3cDtPc6c=",
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  session: {
    strategy: "jwt",
  },
  callbacks: {
    /**
     * Sign-in callback: Creates or identifies the local user record upon Google authentication.
     * Google identity and username remain separate concepts per specification.
     */
    async signIn({ account, profile }) {
      if (account?.provider === "google" && account.providerAccountId && profile?.email) {
        try {
          const googleId = account.providerAccountId;
          const email = profile.email;

          // Check if user exists by googleId or email
          const existingUser = await prisma.user.findFirst({
            where: {
              OR: [{ googleId }, { email }],
            },
          });

          if (!existingUser) {
            // Create a new local user record
            await prisma.user.create({
              data: {
                googleId,
                email,
                username: null, // Usernames are set during onboarding
                normalizedUsername: null,
              },
            });
          } else if (existingUser.googleId !== googleId) {
            // Associate existing email with Google identity if not linked
            await prisma.user.update({
              where: { id: existingUser.id },
              data: { googleId },
            });
          }
          return true;
        } catch (error) {
          console.error("Error in signIn callback:", error);
          return false;
        }
      }
      return true;
    },

    /**
     * JWT callback: Populates JWT with local database user ID and username.
     */
    async jwt({ token, account, profile }) {
      if (token.userId && !token.username) {
        // Refresh username from PostgreSQL if token doesn't have it yet
        const dbUser = await prisma.user.findUnique({
          where: { id: token.userId as string },
          select: { username: true },
        });
        if (dbUser?.username) {
          token.username = dbUser.username;
        }
      } else if (account?.providerAccountId || !token.sub || !token.userId) {
        const email = token.email || profile?.email;
        const googleId = account?.providerAccountId;

        if (email || googleId) {
          const dbUser = await prisma.user.findFirst({
            where: {
              OR: [
                ...(googleId ? [{ googleId }] : []),
                ...(email ? [{ email }] : []),
              ],
            },
          });

          if (dbUser) {
            token.userId = dbUser.id;
            token.username = dbUser.username;
          }
        }
      }
      return token;
    },

    /**
     * Session callback: Exposes user ID and username in the client session.
     */
    async session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token.userId as string) || token.sub || "";
        session.user.username = (token.username as string | null) ?? null;
      }
      return session;
    },
  },
});

