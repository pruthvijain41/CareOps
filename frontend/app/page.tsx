"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Navbar } from "@/components/landing/navbar";
import { Hero } from "@/components/landing/hero";
import { ProblemSection } from "@/components/landing/problem-section";
import { SolutionSection } from "@/components/landing/how-it-works";
import { FeaturesSection } from "@/components/landing/features-grid";
import { WhoIsThisFor, CustomerFlow } from "@/components/landing/relevance";
import { CTASection, Footer } from "@/components/landing/footer";

export default function LandingPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const form = e.currentTarget as HTMLFormElement;
    const passwordInput = form.querySelector('input[type="password"]') as HTMLInputElement;
    const currentPassword = passwordInput?.value || "";

    if (currentPassword.length < 6) {
      setMessage({ type: "error", text: "Password must be at least 6 characters." });
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signUp({
        email,
        password: currentPassword,
        options: {
          data: { full_name: fullName || email.split("@")[0] },
        },
      });

      if (error) throw error;

      // Try auto sign-in
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email,
        password: currentPassword
      });

      if (loginErr) {
        setMessage({ type: "success", text: "Account created! Please check your email to confirm, then log in." });
        return;
      }

      // Signed in — redirect to onboarding
      router.push("/onboarding");
      router.refresh();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      setMessage({ type: "error", text: errorMsg });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white font-sans selection:bg-zinc-900 selection:text-white flex flex-col">
      <Navbar />

      <main className="flex-1">
        <Hero
          email={email}
          setEmail={setEmail}
          fullName={fullName}
          setFullName={setFullName}
          loading={loading}
          onSubmit={handleSignUp}
          message={message}
        />

        <ProblemSection />

        <SolutionSection />

        <FeaturesSection />

        <WhoIsThisFor />

        <CustomerFlow />

        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
