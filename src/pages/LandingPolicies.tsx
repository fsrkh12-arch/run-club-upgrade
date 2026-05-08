import { Shield } from "lucide-react";
import LandingShell from "./_landing-shell";

const policies = [
  { title: "Privacy by default", body: "Your runs are private until you choose to share. Location data is fuzzed for public posts." },
  { title: "No ads, ever", body: "We don't sell attention. The product is the product." },
  { title: "Open data export", body: "Export every run as PDF/CSV anytime. Your training history belongs to you." },
  { title: "Safety first", body: "Live location sharing for solo runs, in-app SOS button, and verified moderators." },
  { title: "GDPR & you", body: "Right to access, rectify and erase your data on request — handled inside Settings." },
  { title: "Third-party data", body: "We never sell or share your personal data with third parties." },
];

export default function LandingPolicies() {
  return (
    <LandingShell eyebrow="Our policies" title="Promises we put in writing.">
      <section className="mx-auto max-w-7xl px-6 py-20">
        <div className="grid gap-px overflow-hidden rounded-2xl bg-border md:grid-cols-2">
          {policies.map((p) => (
            <div key={p.title} className="bg-card p-8">
              <Shield className="mb-4 h-5 w-5 text-[hsl(var(--accent))]" />
              <h3 className="text-xl font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </LandingShell>
  );
}