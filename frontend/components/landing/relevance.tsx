"use client";

import {
    Stethoscope,
    Scissors,
    GraduationCap,
    Hammer,
    Briefcase,
    ArrowRight,
    UserPlus,
    MessageSquare,
    CalendarCheck,
    CheckCircle,
    ClipboardList
} from "lucide-react";

export function WhoIsThisFor() {
    const categories = [
        { name: "Clinics", icon: Stethoscope },
        { name: "Salons", icon: Scissors },
        { name: "Consultants", icon: GraduationCap },
        { name: "Home Services", icon: Hammer },
        { name: "Professional Services", icon: Briefcase },
    ];

    return (
        <section className="py-32 px-4 sm:px-6 lg:px-8 bg-zinc-50 border-b border-slate-200/50 overflow-hidden">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-end justify-between mb-20 gap-10">
                    <div className="max-w-2xl space-y-6">
                        <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Relevance</h2>
                        <h3 className="text-4xl md:text-6xl font-display font-black tracking-tighter text-slate-900 leading-tight">
                            Designed for those who <br />value <span className="text-slate-400 italic">precision.</span>
                        </h3>
                    </div>
                    <p className="text-slate-500 max-w-xs font-bold text-lg tracking-tight leading-relaxed">
                        CareOps solves the specific operational pains of modern providers.
                    </p>
                </div>

                <div className="flex flex-wrap gap-6 justify-center md:justify-start">
                    {categories.map((cat, idx) => (
                        <div key={idx} className="flex items-center gap-4 px-8 py-5 bg-white border border-slate-200/60 rounded-3xl shadow-sm hover:shadow-xl hover:shadow-slate-200/50 transition-all hover:-translate-y-1">
                            <cat.icon className="w-6 h-6 text-slate-900" />
                            <span className="text-lg font-display font-bold text-slate-900 tracking-tight">{cat.name}</span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}

export function CustomerFlow() {
    const flow = [
        { label: "Contact Form", icon: UserPlus },
        { label: "Welcome Message", icon: MessageSquare },
        { label: "Booking Request", icon: CalendarCheck },
        { label: "Confirmation", icon: CheckCircle },
        { label: "Intake Form", icon: ClipboardList },
    ];

    return (
        <section className="py-32 px-4 sm:px-6 lg:px-8 bg-white overflow-hidden">
            <div className="max-w-7xl mx-auto">
                <div className="text-center space-y-6 mb-24">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">The Journey</h2>
                    <h3 className="text-4xl md:text-6xl font-display font-black tracking-tighter text-slate-900 leading-tight">
                        A seamless customer experience.
                    </h3>
                </div>

                <div className="relative pt-10">
                    <div className="absolute top-1/2 left-0 w-full h-[2px] bg-slate-100 hidden md:block -translate-y-1/2 z-0" />

                    <div className="grid grid-cols-1 md:grid-cols-5 gap-16 relative z-10">
                        {flow.map((item, idx) => (
                            <div key={idx} className="flex flex-col items-center group">
                                <div className="w-24 h-24 rounded-[2rem] bg-white border-2 border-slate-100 flex items-center justify-center mb-8 group-hover:border-slate-900 group-hover:bg-slate-900 group-hover:rotate-6 transition-all duration-500 shadow-sm group-hover:shadow-2xl group-hover:shadow-slate-200">
                                    <item.icon className="w-8 h-8 text-slate-300 group-hover:text-white transition-colors" />
                                </div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] text-center group-hover:text-slate-900 transition-colors">
                                    {item.label}
                                </p>
                                {idx < flow.length - 1 && (
                                    <ArrowRight className="w-6 h-6 text-slate-200 mt-6 md:hidden animate-bounce" />
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}
