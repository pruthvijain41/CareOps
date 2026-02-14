"use client";

import { X, ArrowRight } from "lucide-react";

export function ProblemSection() {
    const chaosItems = [
        { name: "Leads", tool: "Spreadsheets", color: "rose" },
        { name: "Bookings", tool: "Calendly", color: "amber" },
        { name: "Emails", tool: "Gmail", color: "indigo" },
        { name: "Forms", tool: "Typeform", color: "emerald" },
        { name: "Inventory", tool: "Notes App", color: "slate" },
    ];

    return (
        <section className="py-32 px-4 sm:px-6 lg:px-8 bg-white overflow-hidden">
            <div className="max-w-7xl mx-auto">
                <div className="text-center max-w-3xl mx-auto space-y-6 mb-24">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">The Context</h2>
                    <h3 className="text-4xl md:text-6xl font-display font-black tracking-tighter text-slate-900 leading-tight">
                        Most service businesses <br />run on <span className="text-rose-500">tool chaos.</span>
                    </h3>
                    <p className="text-slate-500 text-xl font-medium tracking-tight">
                        Scattered reality leads to missed opportunities and operational blind spots.
                    </p>
                </div>

                <div className="relative">
                    {/* Visualizing the Chaos */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-6 relative z-10">
                        {chaosItems.map((item, idx) => (
                            <div key={idx} className="group relative bg-zinc-50 border border-slate-200/60 p-8 rounded-[2rem] transition-all hover:bg-white hover:border-slate-300 hover:shadow-2xl hover:shadow-slate-200/50">
                                <div className="absolute -top-2 -right-2 bg-rose-500 rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg">
                                    <X className="w-4 h-4 text-white" />
                                </div>
                                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 mb-2">{item.name}</p>
                                <p className="text-lg font-display font-bold text-slate-900 tracking-tight">{item.tool}</p>
                            </div>
                        ))}
                    </div>

                    <div className="mt-20 flex flex-col md:flex-row items-center justify-center gap-12 md:gap-24">
                        <div className="space-y-4 max-w-sm text-center md:text-left">
                            <div className="flex items-center gap-3 text-rose-600">
                                <div className="p-2 bg-rose-50 rounded-lg">
                                    <X className="w-5 h-5 font-bold" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-[0.2em]">Disconnected Systems</span>
                            </div>
                            <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">
                                Your tools don't talk to each other. Information is trapped in silos, leading to human error.
                            </p>
                        </div>

                        <div className="flex items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center shadow-xl shadow-slate-200">
                                <ArrowRight className="w-8 h-8 text-white" />
                            </div>
                        </div>

                        <div className="space-y-4 max-w-sm text-center md:text-left">
                            <div className="flex items-center gap-3 text-amber-600">
                                <div className="p-2 bg-amber-50 rounded-lg">
                                    <X className="w-5 h-5 font-bold" />
                                </div>
                                <span className="text-xs font-black uppercase tracking-[0.2em]">Zero Visibility</span>
                            </div>
                            <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">
                                Missed leads, delayed follow-ups, and no real-time pulse on your business health.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
