"use client";

import { signIn, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";

export function SignInButton() {
  return (
    <Button
      type="button"
      variant="default"
      onClick={() => signIn("google", { callbackUrl: "/" })}
    >
      Sign in with Google
    </Button>
  );
}

export function SignOutButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => signOut({ callbackUrl: "/" })}
    >
      Sign out
    </Button>
  );
}
