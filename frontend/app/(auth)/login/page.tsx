"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WakeupNotice } from "@/components/auth/wakeup-notice";
import { healthCheck } from "@/lib/api";

export default function LoginPage() {
    const router = useRouter();
    const setProfile = useWorkspaceStore((s) => s.setProfile);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [fullName, setFullName] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    async function ensureBackendAwake() {
        // Try up to 20 times (approx 1 minute)
        for (let i = 0; i < 20; i++) {
            try {
                const res = await healthCheck();
                // Specifically check for our backend's signature
                if (res && res.status === "healthy" && res.service === "careops") {
                    return true;
                }
                // If it's something else (e.g. Render spin-up page), wait
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (e) {
                // Network error or timeout — backend is still booting
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
        return false;
    }

    async function handleLogin(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const supabase = createClient();
            const { error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) throw authError;

            // Wait for backend to wake up before profile fetches
            const awake = await ensureBackendAwake();
            if (!awake) {
                throw new Error("The server is taking too long to wake up. Please refresh and try again.");
            }

            // Fetch profile with workspace details
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
                const { data: profile } = await supabase
                    .from("profiles")
                    .select("id, workspace_id, role, full_name, avatar_url, permissions, workspaces(id, name, slug, settings)")
                    .eq("id", user.id)
                    .single();

                if (profile?.workspaces) {
                    const ws = profile.workspaces as any;
                    const workspace = Array.isArray(ws) ? ws[0] : ws;
                    if (workspace?.slug) {
                        // Populate the workspace store so dashboard knows who we are
                        setProfile({
                            id: profile.id,
                            workspaceId: workspace.id,
                            workspaceName: workspace.name,
                            workspaceSlug: workspace.slug,
                            role: profile.role,
                            fullName: profile.full_name,
                            avatarUrl: profile.avatar_url,
                            email: user.email ?? null,
                            permissions: (profile as any).permissions ?? {
                                inbox: true,
                                bookings: true,
                                forms: true,
                                inventory: false,
                                reports: false,
                            },
                        });

                        // Staff always goes to dashboard (skip onboarding)
                        if (profile.role === "staff") {
                            router.push(`/${workspace.slug}`);
                            return;
                        }

                        // Owner: check if onboarding is complete
                        const isOnboarded = workspace.settings?.onboarded === true;
                        if (!isOnboarded) {
                            router.push("/onboarding");
                        } else {
                            router.push(`/${workspace.slug}`);
                        }
                        return;
                    }
                }
                // No workspace yet — go to onboarding  
                router.push("/onboarding");
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : "Login failed");
        } finally {
            setLoading(false);
        }
    }

    async function handleSignUp(e: React.FormEvent) {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setSuccess(null);

        if (password.length < 6) {
            setError("Password must be at least 6 characters");
            setLoading(false);
            return;
        }

        try {
            const supabase = createClient();
            const { data, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: { full_name: fullName || email.split("@")[0] },
                },
            });

            if (authError) throw authError;

            // Wait for backend to wake up
            const awake = await ensureBackendAwake();
            if (!awake) {
                throw new Error("The server is taking too long to wake up. Please refresh and try again.");
            }

            if (data.user) {
                // Auto-login after signup
                const { error: loginError } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                });

                if (loginError) {
                    // Email confirmation might be required
                    setSuccess("Account created! Check your email to confirm, then log in.");
                    return;
                }

                // Signed in — check if workspace already exists (returning user)
                const { data: { user: loggedInUser } } = await supabase.auth.getUser();
                if (loggedInUser) {
                    const { data: existingProfile } = await supabase
                        .from("profiles")
                        .select("workspace_id, workspaces(slug, settings)")
                        .eq("id", loggedInUser.id)
                        .single();

                    if (existingProfile?.workspaces) {
                        const ws = existingProfile.workspaces as any;
                        const workspace = Array.isArray(ws) ? ws[0] : ws;
                        const isOnboarded = workspace?.settings?.onboarded === true;
                        if (workspace?.slug) {
                            setProfile({
                                id: loggedInUser.id,
                                workspaceId: existingProfile.workspace_id,
                                workspaceName: workspace.name || "",
                                workspaceSlug: workspace.slug,
                                role: "owner",
                                fullName: fullName || email.split("@")[0],
                                avatarUrl: null,
                                email: loggedInUser.email ?? null,
                                permissions: { inbox: true, bookings: true, forms: true, inventory: true, reports: true },
                            });
                            router.push(isOnboarded ? `/${workspace.slug}` : "/onboarding");
                            return;
                        }
                    }

                    // No workspace yet — go straight to onboarding
                    // Backend finalize will create workspace + profile
                    router.push("/onboarding");
                    return;
                }
            }

            setSuccess("Account created! You can now log in.");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Registration failed");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4 font-sans selection:bg-slate-900 selection:text-white">
            <div className="w-full max-w-[420px] space-y-4">
                <div className="text-center space-y-1">
                    <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-slate-900 text-white shadow-xl shadow-slate-200 mb-1">
                        <span className="font-display font-black text-lg tracking-tighter">C</span>
                    </div>
                    <h1 className="text-3xl font-display font-black tracking-tighter text-slate-900 leading-none">
                        Welcome to CareOps
                    </h1>
                    <p className="text-slate-500 font-medium tracking-tight text-[13px]">
                        Simplify your operations, scale your excellence.
                    </p>
                </div>

                <div className="bg-white border border-slate-200/60 rounded-[2rem] p-5 md:p-6 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.06)]">
                    <Tabs defaultValue="login" className="w-full">
                        <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-50 p-1 mb-4">
                            <TabsTrigger
                                value="login"
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-400 font-display font-bold text-[13px] h-8 transition-all"
                            >
                                Sign In
                            </TabsTrigger>
                            <TabsTrigger
                                value="signup"
                                className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm text-slate-400 font-display font-bold text-[13px] h-8 transition-all"
                            >
                                Create Account
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="login" className="space-y-4 focus-visible:outline-none focus:ring-0 px-1">
                            <form onSubmit={handleLogin} className="space-y-3.5">
                                <div className="space-y-1.5">
                                    <Label htmlFor="login-email" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Email Address</Label>
                                    <Input
                                        id="login-email"
                                        type="email"
                                        placeholder="name@company.com"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 font-bold text-slate-900 focus-visible:ring-slate-900 transition-all text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex justify-between items-center ml-1">
                                        <Label htmlFor="login-password" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Password</Label>
                                        <button type="button" className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-900 transition-colors">Forgot?</button>
                                    </div>
                                    <Input
                                        id="login-password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 font-bold text-slate-900 focus-visible:ring-slate-900 transition-all text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                                        <p className="text-[11px] font-bold text-rose-600 tracking-tight leading-tight">{error}</p>
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                        <p className="text-[11px] font-bold text-emerald-600 tracking-tight leading-tight">{success}</p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-sm shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
                                    disabled={loading}
                                >
                                    {loading ? "Verifying..." : "Sign In"}
                                </Button>

                                {loading && <WakeupNotice />}
                            </form>
                        </TabsContent>

                        <TabsContent value="signup" className="space-y-4 focus-visible:outline-none focus:ring-0 px-1">
                            <form onSubmit={handleSignUp} className="space-y-3.5">
                                <div className="space-y-1.5">
                                    <Label htmlFor="signup-name" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Full Name</Label>
                                    <Input
                                        id="signup-name"
                                        type="text"
                                        placeholder="Enter your name"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 font-bold text-slate-900 focus-visible:ring-slate-900 transition-all text-sm"
                                        value={fullName}
                                        onChange={(e) => setFullName(e.target.value)}
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="signup-email" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Work Email</Label>
                                    <Input
                                        id="signup-email"
                                        type="email"
                                        placeholder="name@company.com"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 font-bold text-slate-900 focus-visible:ring-slate-900 transition-all text-sm"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        required
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label htmlFor="signup-password" className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 ml-1">Password (min. 6 chars)</Label>
                                    <Input
                                        id="signup-password"
                                        type="password"
                                        placeholder="••••••••"
                                        className="h-11 rounded-xl border-slate-200 bg-slate-50/50 px-4 font-bold text-slate-900 focus-visible:ring-slate-900 transition-all text-sm"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        required
                                        minLength={6}
                                    />
                                </div>

                                {error && (
                                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-xl">
                                        <p className="text-[11px] font-bold text-rose-600 tracking-tight leading-tight">{error}</p>
                                    </div>
                                )}

                                {success && (
                                    <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                                        <p className="text-[11px] font-bold text-emerald-600 tracking-tight leading-tight">{success}</p>
                                    </div>
                                )}

                                <Button
                                    type="submit"
                                    className="w-full h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-display font-black text-sm shadow-lg shadow-slate-200 transition-all active:scale-[0.98]"
                                    disabled={loading}
                                >
                                    {loading ? "Provisioning..." : "Get Started Now"}
                                </Button>

                                {loading && <WakeupNotice />}
                            </form>
                        </TabsContent>
                    </Tabs>
                </div>

                <div className="text-center">
                    <p className="text-[9px] font-black uppercase tracking-[0.1em] text-slate-300">
                        Secure Platform Connection
                    </p>
                </div>
            </div>
        </div>
    );
}
