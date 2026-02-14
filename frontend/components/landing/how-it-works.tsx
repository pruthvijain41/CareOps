"use client";

import { CheckCircle2 } from "lucide-react";

export function SolutionSection() {
    const steps = [
        {
            title: "Set up in minutes",
            description: "Initialize your workspace through a simple conversational setup process.",
            tag: "Process 01",
        },
        {
            title: "Share your business",
            description: "Ready-to-use professional booking links and contact forms for your audience.",
            tag: "Process 02",
        },
        {
            title: "Automate the busywork",
            description: "Let the engine handle confirmations, reminders and follow-up sequences.",
            tag: "Process 03",
        },
        {
            title: "Monitor & Grow",
            description: "Track performance from your unified dashboard and act on real-time data.",
            tag: "Process 04",
        },
    ];

    return (
        <section id="how-it-works" className="py-32 px-4 sm:px-6 lg:px-8 bg-zinc-50 border-y border-slate-200/50">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col lg:flex-row gap-24 items-start">
                    <div className="lg:w-1/3 sticky top-40 space-y-8">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">The Solution</h2>
                        <h3 className="text-4xl font-display font-black tracking-tighter text-slate-900 leading-tight">
                            One home for your <br />entire operation.
                        </h3>
                        <p className="text-lg text-slate-500 font-medium tracking-tight leading-relaxed">
                            CareOps replaces the complexity of disconnected tools with a single,
                            unified platform engineered for service-based businesses.
                        </p>
                        <div className="pt-6">
                            <div className="p-8 bg-white rounded-[2rem] border border-slate-200 shadow-xl shadow-slate-200/50 relative overflow-hidden group">
                                <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-slate-100 transition-colors" />
                                <p className="text-lg font-display font-bold text-slate-900 relative z-10 tracking-tight">Unified Excellence</p>
                                <p className="text-sm font-medium text-slate-400 mt-1 relative z-10 tracking-tight">Your data, synchronized.</p>
                            </div>
                        </div>
                    </div>

                    <div className="lg:w-2/3 grid grid-cols-1 sm:grid-cols-2 gap-8 md:gap-12">
                        {steps.map((step, idx) => (
                            <div key={idx} className="p-10 bg-white border border-slate-200/60 rounded-[2.5rem] transition-all hover:bg-white hover:scale-[1.03] hover:shadow-[0_32px_64px_-16px_rgba(0,0,0,0.08)] relative group">
                                <span className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-300 mb-8 block group-hover:text-slate-900 transition-colors">
                                    {step.tag}
                                </span>
                                <h4 className="text-2xl font-display font-black text-slate-900 mb-4 tracking-tight">{step.title}</h4>
                                <p className="text-base text-slate-500 font-medium leading-relaxed mb-10 tracking-tight">
                                    {step.description}
                                </p>
                                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center group-hover:bg-slate-900 group-hover:border-slate-800 transition-all duration-300">
                                    <CheckCircle2 className="w-6 h-6 text-slate-300 group-hover:text-white transition-colors" />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
