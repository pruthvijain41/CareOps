"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export function Navbar() {
    return (
        <nav className="fixed top-0 w-full z-50 border-b border-slate-200/60 bg-white/70 backdrop-blur-xl">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between items-center h-20">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                            <span className="text-white font-display font-bold text-xl tracking-tighter">C</span>
                        </div>
                        <span className="text-xl font-display font-bold tracking-tight text-slate-900">CareOps</span>
                    </div>
                    <div className="hidden md:flex items-center gap-10">
                        <Link href="#features" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors tracking-tight">
                            Features
                        </Link>
                        <Link href="#how-it-works" className="text-sm font-semibold text-slate-500 hover:text-slate-900 transition-colors tracking-tight">
                            How it Works
                        </Link>
                    </div>
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" asChild className="text-sm font-bold text-slate-600">
                            <Link href="/login">Sign In</Link>
                        </Button>
                        <Button asChild className="rounded-full px-8 bg-slate-900 text-white hover:bg-slate-800 transition-all shadow-md shadow-slate-200 font-bold h-11">
                            <Link href="#get-started">Get Started</Link>
                        </Button>
                    </div>
                </div>
            </div>
        </nav>
    );
}
