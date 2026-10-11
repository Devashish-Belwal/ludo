"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateUsername } from "@/actions/user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface UsernameCardProps {
  initialUsername: string | null;
}

export function UsernameCard({ initialUsername }: UsernameCardProps) {
  const router = useRouter();
  const [username, setUsername] = useState(initialUsername ?? "");
  const [currentSaved, setCurrentSaved] = useState(initialUsername ?? "");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const hasChanged = username.trim() !== currentSaved.trim();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!hasChanged) return;

    setIsPending(true);
    try {
      const res = await updateUsername(username);
      if (!res.success) {
        setError(res.error);
      } else {
        setCurrentSaved(res.username);
        setUsername(res.username);
        setSuccess("Username saved successfully!");
        router.refresh(); // Seamlessly update server components (Navbar & Play buttons)
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-4">
        <h2 className="text-xl font-semibold tracking-tight">Your Profile</h2>
        <p className="text-sm text-muted-foreground">
          {currentSaved
            ? "Your username is displayed to opponents and friends."
            : "Please create a unique username before playing games."}
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="username">Username</Label>
          <div className="flex gap-3">
            <Input
              id="username"
              type="text"
              placeholder="e.g. MasterRoller_99"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setError(null);
                setSuccess(null);
              }}
              disabled={isPending}
              maxLength={20}
              className="max-w-xs"
            />
            <Button
              type="submit"
              disabled={!hasChanged || isPending || username.trim().length === 0}
            >
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            3–20 characters. Letters, numbers, and underscores only.
          </p>
        </div>

        {error && (
          <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive font-medium">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-md bg-emerald-500/15 p-3 text-sm text-emerald-600 dark:text-emerald-400 font-medium">
            {success}
          </div>
        )}
      </form>
    </div>
  );
}

