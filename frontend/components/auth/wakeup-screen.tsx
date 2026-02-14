"use client";

import { useEffect, useState, useCallback } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { healthCheck } from "@/lib/api";

/**
 * Tips to cycle through while the backend wakes up.
 */
const TIPS = [
    "CareOps automates your inventory tracking effortlessly.",
    "Manage bookings with zero timezone confusion.",
    "WhatsApp bridge keeps you connected with suppliers.",
    "Custom forms help you collect precisely the data you need.",
    "AI-powered reply suggestions save you hours every week.",
    "Automated email workflows engage your leads instantly.",
    "Your dashboard gives a real-time pulse of your business.",
];

/**
 * Full-page wakeup gate.
 * Renders a beautiful loading screen until the Render backend responds
 * to the health check. Wraps children — once awake, children render.
 */
export function WakeupGate({ children }: { children: React.ReactNode }) {
    const [isAwake, setIsAwake] = useState(false);
    const [tipIndex, setTipIndex] = useState(0);
    const [dots, setDots] = useState("");
    const [attempt, setAttempt] = useState(0);

    const checkBackend = useCallback(async () => {
        try {
            const res = await healthCheck();
            // Strictly check signature. If degraded, it means DB is not reachable.
            // We should wait until it's 'healthy'.
            if (res && res.status === "healthy" && res.service === "careops") {
                setIsAwake(true);
                return true;
            }
            if (res && res.status === "degraded") {
                console.warn("Backend is awake but degraded (DB issue). Waiting...");
            }
        } catch {
            // Backend still booting or network error
        }
        return false;
    }, []);

    useEffect(() => {
        let cancelled = false;

        async function poll() {
            // Try immediately first
            const ok = await checkBackend();
            if (ok || cancelled) return;

            // Retry every 3 seconds, up to 60 times (~3 min)
            // cold starts on Render can sometimes take a while if multiple services wake up
            for (let i = 0; i < 60; i++) {
                if (cancelled) return;
                await new Promise((r) => setTimeout(r, 3000));
                setAttempt(i + 1);
                const success = await checkBackend();
                if (success || cancelled) return;
            }
        }

        poll();
        return () => { cancelled = true; };
    }, [checkBackend]);

    // Cycle tips
    useEffect(() => {
        if (isAwake) return;
        const interval = setInterval(() => {
            setTipIndex((prev) => (prev + 1) % TIPS.length);
        }, 4000);
        return () => clearInterval(interval);
    }, [isAwake]);

    // Animate dots
    useEffect(() => {
        if (isAwake) return;
        const interval = setInterval(() => {
            setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
        }, 500);
        return () => clearInterval(interval);
    }, [isAwake]);

    if (isAwake) {
        return <>{children}</>;
    }

    return (
        <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center font-sans selection:bg-slate-900 selection:text-white">
            {/* Logo */}
            <div className="mb-8 flex flex-col items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center shadow-2xl shadow-slate-300 animate-pulse">
                    <span className="text-white font-display font-black text-2xl tracking-tighter">
                        C
                    </span>
                </div>
                <h1 className="text-2xl font-display font-black tracking-tight text-slate-900">
                    CareOps
                </h1>
            </div>

            {/* Spinner */}
            <div className="mb-6 flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                <span className="text-sm font-bold text-slate-500 tracking-tight">
                    Waking up the server{dots}
                </span>
            </div>

            {/* Progress hint */}
            <div className="mb-8 px-6 py-3 bg-slate-50 rounded-2xl border border-slate-100 max-w-sm text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">
                        Free tier cold start • ~30-60s
                    </span>
                </div>
                <p
                    key={tipIndex}
                    className="text-[13px] font-medium text-slate-500 italic animate-in fade-in slide-in-from-bottom-2 duration-500"
                >
                    {TIPS[tipIndex]}
                </p>
            </div>

            {/* Subtle progress bar */}
            <div className="w-48 h-1 bg-slate-100 rounded-full overflow-hidden">
                <div
                    className="h-full bg-slate-900 rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min((attempt / 20) * 100, 95)}%` }}
                />
            </div>
        </div>
    );
}
