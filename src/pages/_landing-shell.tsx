import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ReactNode } from "react";

export default function LandingShell({ title, eyebrow, children }: { title: string; eyebrow: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <Link to="/" className="flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-4 w-4" /></div><span className="font-semibold tracking-tight">Run Club</span></Link>
          <nav className="hidden items-center gap-8 text-sm md:flex">
            <Link to="/" className="text-muted-foreground hover:text-foreground">Home</Link>
            <Link to="/features" className="text-muted-foreground hover:text-foreground">Features</Link>
            <Link to="/community" className="text-muted-foreground hover:text-foreground">Community</Link>
            <Link to="/policies" className="text-muted-foreground hover:text-foreground">Policies</Link>
            <Link to="/download" className="text-muted-foreground hover:text-foreground">Download</Link>
          </nav>
          <div className="flex items-center gap-2"><Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link><Link to="/auth"><Button size="sm">Get started</Button></Link></div>
        </div>
      </header>
      <section className="border-b border-border bg-gradient-to-b from-muted/40 to-background">
        <div className="mx-auto max-w-7xl px-6 py-16">
          <div className="font-mono-tech text-xs uppercase tracking-widest text-muted-foreground">{eyebrow}</div>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-6xl">{title}</h1>
        </div>
      </section>
      {children}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground md:flex-row">
          <div className="flex items-center gap-2"><div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground"><Zap className="h-3 w-3" /></div><span>Run Club © 2026</span></div>
          <div className="flex gap-6"><Link to="/policies">Privacy</Link><Link to="/policies">Terms</Link><Link to="/community">Community guidelines</Link></div>
        </div>
      </footer>
    </main>
  );
}