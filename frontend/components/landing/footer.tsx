"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function CTASection() {
    return (
        <section className="py-40 px-4 sm:px-6 lg:px-8 bg-slate-900 overflow-hidden relative">
            <div className="absolute top-0 right-0 w-[40rem] h-[40rem] bg-emerald-500/5 rounded-full -mr-80 -mt-80 blur-[120px]" />
            <div className="absolute bottom-0 left-0 w-[40rem] h-[40rem] bg-indigo-500/5 rounded-full -ml-80 -mb-80 blur-[120px]" />

            <div className="max-w-4xl mx-auto text-center space-y-12 relative z-10">
                <h2 className="text-5xl md:text-8xl font-display font-black tracking-tighter text-white leading-[0.9]">
                    Your business is <br /><span className="text-slate-500 italic text-6xl md:text-8xl">ready to scale.</span>
                </h2>
                <p className="text-slate-400 text-xl font-medium max-w-2xl mx-auto leading-relaxed tracking-tight">
                    Set up your professional workspace in minutes and orchestrate your entire operation from one platform.
                </p>
                <div className="pt-8">
                    <Button size="lg" asChild className="rounded-full px-16 bg-white text-slate-900 hover:bg-slate-100 h-20 text-xl font-bold shadow-2xl shadow-indigo-500/10 transition-all hover:scale-105 active:scale-95">
                        <Link href="#get-started">Get Started Free</Link>
                    </Button>
                </div>
            </div>
        </section>
    );
}

export function Footer() {
    return (
        <footer className="py-24 px-4 sm:px-6 lg:px-8 bg-white border-t border-slate-200/50">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row justify-between items-start gap-16 border-b border-slate-100 pb-20 mb-20">
                    <div className="space-y-6 max-w-xs">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg">
                                <span className="text-white font-display font-bold text-xl tracking-tighter">C</span>
                            </div>
                            <span className="text-2xl font-display font-bold tracking-tight text-slate-900">CareOps</span>
                        </div>
                        <p className="text-base text-slate-400 font-medium leading-relaxed tracking-tight">
                            The unified operations platform for modern service-based businesses.
                        </p>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-20">
                        <div className="space-y-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Platform</p>
                            <nav className="flex flex-col gap-4">
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Features</Link>
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Automation</Link>
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Pricing</Link>
                            </nav>
                        </div>
                        <div className="space-y-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Resources</p>
                            <nav className="flex flex-col gap-4">
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Docs</Link>
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">API</Link>
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Status</Link>
                            </nav>
                        </div>
                        <div className="space-y-6">
                            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-300">Legal</p>
                            <nav className="flex flex-col gap-4">
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Privacy</Link>
                                <Link href="#" className="text-base font-bold text-slate-900 hover:text-slate-400 transition-colors">Terms</Link>
                            </nav>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col md:flex-row justify-between items-center gap-8">
                    <p className="text-sm font-bold text-slate-400 tracking-tight">
                        © 2026 CareOps Hub. All rights reserved.
                    </p>
                    <div className="flex items-center gap-6">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 whitespace-nowrap">Engineered for service excellence</span>
                        <div className="flex gap-4">
                            <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100" />
                            <div className="w-8 h-8 rounded-full bg-slate-50 border border-slate-100" />
                        </div>
                    </div>
                </div>
            </div>
        </footer>
    );
}
