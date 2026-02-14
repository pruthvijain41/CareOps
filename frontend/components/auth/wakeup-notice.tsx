"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";

/**
 * Static tips to cycle through while the backend wakes up.
 */
const TIPS = [
    "CareOps automates your inventory tracking effortlessly.",
    "Manage bookings with zero timezone confusion.",
    "WhatsApp bridge keeps you connected with suppliers.",
    "Custom forms help you collect precisely the data you need.",
    "AI-powered reply suggestions save you hours every week.",
];

export function WakeupNotice() {
    const [tipIndex, setTipIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setTipIndex((prev) => (prev + 1) % TIPS.length);
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="mt-4 pt-4 border-t border-slate-100 animate-in fade-in slide-in-from-top-1 duration-500">
            <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-3 h-3 text-emerald-500 animate-pulse" />
                <p className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">
                    Backend waking up...
                </p>
                <span className="text-[10px] text-slate-400 font-medium ml-auto">
                    Render boot: ~1m
                </span>
            </div>
            <p
                key={tipIndex}
                className="text-[11px] font-medium text-slate-500 italic animate-in fade-in slide-in-from-right-2 duration-500"
            >
                Tip: {TIPS[tipIndex]}
            </p>
        </div>
    );
}
