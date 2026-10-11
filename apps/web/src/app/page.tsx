import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-6 bg-background text-foreground">
      <main className="w-full max-w-2xl rounded-xl border border-border bg-card p-8 shadow-sm text-center">
        <h1 className="text-3xl font-bold tracking-tight mb-3">
          Multiplayer Ludo
        </h1>
        <p className="text-muted-foreground mb-6">
          Milestone 1 — Project Foundation initialized successfully.
        </p>
        <div className="inline-flex gap-3">
          <Button variant="default">Get Started</Button>
          <Button variant="outline">Docs & Specifications</Button>
        </div>
      </main>
    </div>
  );
}
