"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WakeupNotice } from "@/components/auth/wakeup-notice";

interface HeroProps {
    email: string;
    setEmail: (val: string) => void;
    fullName: string;
    setFullName: (val: string) => void;
    loading: boolean;
    onSubmit: (e: React.FormEvent) => void;
    message: { type: "success" | "error"; text: string } | null;
}

export function Hero({ email, setEmail, fullName, setFullName, loading, onSubmit, message }: HeroProps) {
    return (
        <section className="pt-40 pb-24 px-4 sm:px-6 lg:px-8 bg-zinc-50 border-b border-slate-200/50">
            <div className="max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-20">
                <div className="flex-1 space-y-10 text-center lg:text-left">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-slate-800 shadow-xl shadow-slate-200">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] uppercase tracking-[0.2em] font-black text-slate-100">Unified Operations Engine</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter text-slate-900 leading-[0.95] drop-shadow-sm">
                        One Platform to Run Your Entire <br /><span className="text-slate-400">Service Business</span>
                    </h1>

                    <p className="text-xl text-slate-500 leading-relaxed max-w-xl mx-auto lg:mx-0 font-medium tracking-tight">
                        Stop juggling tools. Manage your leads, bookings, inbox, forms and inventory
                        from one place — and let automation handle the rest.
                    </p>

                    <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6">
                        <Button size="lg" className="rounded-full px-10 bg-slate-900 text-white hover:bg-slate-800 h-16 text-lg font-bold shadow-2xl shadow-slate-300 transition-all hover:scale-105 active:scale-95">
                            Get Started Free
                        </Button>
                        <div className="flex items-center gap-3">
                            <div className="flex -space-x-3">
                                {[1, 2, 3, 4].map(i => (
                                    <div key={i} className="w-10 h-10 rounded-full border-2 border-white bg-slate-200 shadow-sm" />
                                ))}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-sm font-bold text-slate-900 tracking-tight">500+ Businesses</span>
                                <span className="text-[10px] uppercase font-black text-slate-400 tracking-widest">Trust CareOps</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="get-started" className="w-full max-w-lg bg-white p-10 rounded-[2.5rem] border border-slate-200 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-slate-100 transition-colors" />

                    <div className="space-y-8 relative z-10">
                        <div className="space-y-3">
                            <h2 className="text-3xl font-display font-bold text-slate-900 tracking-tight">Create your account</h2>
                            <p className="text-slate-500 font-medium tracking-tight">Set up your professional workspace in minutes.</p>
                        </div>

                        <form onSubmit={onSubmit} className="space-y-5">
                            <div className="space-y-2.5">
                                <Label htmlFor="fullName" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Full Name</Label>
                                <Input
                                    id="fullName"
                                    type="text"
                                    placeholder="John Doe"
                                    className="rounded-2xl border-slate-200 bg-slate-50/50 h-14 focus:ring-2 focus:ring-slate-900 transition-all font-semibold px-6"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2.5">
                                <Label htmlFor="email" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Business Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="name@company.com"
                                    className="rounded-2xl border-slate-200 bg-slate-50/50 h-14 focus:ring-2 focus:ring-slate-900 transition-all font-semibold px-6"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2.5">
                                <Label htmlFor="password" id="pass-label" className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Password (min 6 chars)</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    className="rounded-2xl border-slate-200 bg-slate-50/50 h-14 focus:ring-2 focus:ring-slate-900 transition-all font-semibold px-6"
                                    required
                                    minLength={6}
                                />
                            </div>
                            <Button
                                type="submit"
                                className="w-full rounded-2xl bg-slate-900 text-white hover:bg-slate-800 h-14 font-bold shadow-xl shadow-slate-200 transition-all hover:scale-[1.02] active:scale-[0.98]"
                                disabled={loading}
                            >
                                {loading ? "Creating your account..." : "Get Started Now"}
                            </Button>

                            {loading && <WakeupNotice />}
                        </form>

                        {message && (
                            <div className={`p-5 rounded-2xl border text-sm font-bold tracking-tight shadow-sm ${message.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                                {message.text}
                            </div>
                        )}

                        <p className="text-xs text-center text-slate-400 font-medium leading-relaxed px-4">
                            By joining, you agree to our <span className="text-slate-900 font-bold underline underline-offset-4 cursor-pointer">Terms of Service</span> and <span className="text-slate-900 font-bold underline underline-offset-4 cursor-pointer">Privacy Policy</span>. No credit card required.
                        </p>
                    </div>
                </div>
            </div>
        </section>
    );
}
