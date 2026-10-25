import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Zap, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export default function Auth() {
  const nav = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [weight, setWeight] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const { data: l } = supabase.auth.onAuthStateChange((_e, s) => { if (s) nav("/app", { replace: true }); });
    supabase.auth.getSession().then(({ data }) => { if (data.session) nav("/app", { replace: true }); });
    return () => l.subscription.unsubscribe();
  }, [nav]);

  const submit = async () => {
    if (!email || password.length < 6) return toast.error("Use a valid email and 6+ char password.");
    if (mode === "signup" && (!name || !dob || !weight)) return toast.error("Add your name, date of birth and weight to personalize your training.");
    setLoading(true);
    const r = mode === "signup"
      ? await supabase.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/app`, data: { full_name: name || email.split("@")[0] } } })
      : await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (r.error) return toast.error(r.error.message);
    if (mode === "signup" && (r as any).data?.user) {
      const uid = (r as any).data.user.id;
      // Profile row may be created by trigger; upsert personal fields.
      await supabase.from("profiles").update({ display_name: name, dob, weight_kg: Number(weight), avatar_initials: name.slice(0,2).toUpperCase() }).eq("user_id", uid);
    }
    toast.success(mode === "signup" ? "Check your email to confirm." : "Welcome back.");
  };

  const google = async () => {
    const r = await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/app` } });
    if (r.error) toast.error(String(r.error.message || r.error));
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="grid min-h-screen lg:grid-cols-2">
        <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border bg-primary p-10 text-primary-foreground lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,hsl(var(--accent)/0.25),transparent_60%)]" />
          <Link to="/" className="relative flex items-center gap-2"><div className="grid h-9 w-9 place-items-center rounded-lg bg-primary-foreground text-primary"><Zap className="h-4 w-4" /></div><span className="font-semibold">Run Club</span></Link>
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="relative">
            <h1 className="text-5xl font-semibold leading-tight tracking-tight">Run further.<br/><span className="opacity-60">Together.</span></h1>
            <p className="mt-6 max-w-md opacity-70">Your runs, your communities, your XP — all synced and waiting.</p>
          </motion.div>
          <div className="relative font-mono-tech text-xs uppercase tracking-widest opacity-50">v2.0 · made for clubs</div>
        </section>
        <section className="flex items-center justify-center p-6 md:p-10">
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
            <Link to="/" className="mb-8 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> Back home</Link>
            <h2 className="text-3xl font-semibold tracking-tight">{mode === "signin" ? "Welcome back" : "Create your account"}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{mode === "signin" ? "Sign in to keep your progress and crews." : "Start tracking, earning XP, and joining clubs."}</p>
            <div className="mt-6 grid grid-cols-2 rounded-xl border border-border p-1">
              <button onClick={() => setMode("signin")} className={cn("rounded-lg px-3 py-2 text-sm transition", mode === "signin" && "bg-primary text-primary-foreground")}>Sign in</button>
              <button onClick={() => setMode("signup")} className={cn("rounded-lg px-3 py-2 text-sm transition", mode === "signup" && "bg-primary text-primary-foreground")}>Create account</button>
            </div>
            <div className="mt-5 space-y-3">
              {mode === "signup" && (
                <>
                  <Input placeholder="Display name" value={name} onChange={(e) => setName(e.target.value)} />
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">Date of birth</label><Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} /></div>
                    <div><label className="mb-1 block text-[11px] uppercase tracking-widest text-muted-foreground">Weight (kg)</label><Input type="number" min="20" max="250" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="70" /></div>
                  </div>
                  <p className="rounded-lg border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground">🔒 Your date of birth and weight stay on your account and are <span className="font-semibold text-foreground">never shared with third parties</span>. We only use them to personalize calories, pace zones and recommendations.</p>
                </>
              )}
              <Input type="email" placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
              <Input type="password" placeholder="Password (6+ chars)" value={password} onChange={(e) => setPassword(e.target.value)} />
              <Button className="w-full rounded-xl" onClick={submit} disabled={loading}>{loading ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}</Button>
              <div className="relative my-2 text-center"><span className="bg-background px-3 text-xs text-muted-foreground">or</span><div className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" /></div>
              <Button variant="outline" className="w-full rounded-xl" onClick={google}>Continue with Google</Button>
              <Button variant="outline" className="w-full rounded-xl" onClick={async () => { const r = await supabase.auth.signInWithOAuth({ provider: "apple", options: { redirectTo: `${window.location.origin}/app` } }); if (r.error) toast.error(String(r.error.message || r.error)); }}> Continue with Apple</Button>
            </div>
          </motion.div>
        </section>
      </div>
    </main>
  );
}
