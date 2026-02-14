"use client";

import {
    Mail,
    Calendar,
    Zap,
    FileText,
    Package,
    Users,
    BarChart3,
    MessageSquare,
    Sparkles,
    Clock,
} from "lucide-react";

export function FeaturesSection() {
    const features = [
        {
            title: "Unified Inbox",
            description: "All customer messages — Gmail, WhatsApp, SMS — together in one place with read tracking.",
            icon: Mail,
        },
        {
            title: "AI Smart Reply",
            description: "Get AI-generated reply suggestions based on conversation context. Reply faster, stay consistent.",
            icon: Sparkles,
        },
        {
            title: "WhatsApp Integration",
            description: "Connect your WhatsApp to send and receive messages directly from CareOps. QR code setup in seconds.",
            icon: MessageSquare,
        },
        {
            title: "Booking Management",
            description: "Public booking page, availability control, and automatic confirmations with calendar sync.",
            icon: Calendar,
        },
        {
            title: "Business Hours",
            description: "Set your working hours during onboarding. Let customers know when you're available.",
            icon: Clock,
        },
        {
            title: "Smart Automation",
            description: "Welcome messages, reminders, and follow-ups — all triggered automatically by events.",
            icon: Zap,
        },
        {
            title: "Custom Forms",
            description: "Build intake forms, surveys, and contact forms — with automatic response tracking.",
            icon: FileText,
        },
        {
            title: "Inventory Alerts",
            description: "Track stock levels and get notified before you run out of supplies.",
            icon: Package,
        },
        {
            title: "Staff Management",
            description: "Invite team members and control exactly what they can see and do.",
            icon: Users,
        },
        {
            title: "Business Dashboard",
            description: "Real-time overview of bookings, revenue, team activity, and AI-powered insights.",
            icon: BarChart3,
        },
    ];

    return (
        <section id="features" className="py-32 px-4 sm:px-6 lg:px-8 bg-white overflow-hidden">
            <div className="max-w-7xl mx-auto">
                <div className="text-center max-w-2xl mx-auto space-y-6 mb-24">
                    <h2 className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-400">Core Capabilities</h2>
                    <h3 className="text-4xl md:text-6xl font-display font-black tracking-tighter text-slate-900 leading-tight">
                        Everything you need, <br /><span className="text-slate-400 italic">nothing you don&apos;t.</span>
                    </h3>
                    <p className="text-slate-500 text-xl font-medium tracking-tight">
                        Run your entire service business from one platform — no tool-switching, no headaches.
                    </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-slate-200 border border-slate-200 rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200/50">
                    {features.map((feature, idx) => (
                        <div key={idx} className="bg-white p-12 group transition-colors hover:bg-slate-50">
                            <div className="w-14 h-14 rounded-2xl bg-slate-900 flex items-center justify-center mb-10 group-hover:scale-110 group-hover:rotate-3 transition-all duration-300">
                                <feature.icon className="w-7 h-7 text-white" />
                            </div>
                            <h4 className="text-xl font-display font-black text-slate-900 mb-3 tracking-tight">{feature.title}</h4>
                            <p className="text-base text-slate-500 font-medium leading-relaxed tracking-tight">
                                {feature.description}
                            </p>
                        </div>
                    ))}
                    {/* CTA fill card */}
                    <div className="hidden lg:flex bg-slate-900 p-12 flex-col justify-end items-start text-white relative group overflow-hidden col-span-2">
                        <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full -mr-32 -mt-32 blur-3xl group-hover:bg-white/10 transition-colors" />
                        <p className="text-2xl font-display font-black tracking-tight mb-6 relative z-10 leading-snug">AI-powered features <br />launching every week.</p>
                        <button className="text-[10px] font-black uppercase tracking-[0.2em] flex items-center gap-3 group/btn relative z-10 text-slate-300 hover:text-white transition-colors">
                            Get Started Free <span className="group-hover/btn:translate-x-2 transition-transform duration-300">→</span>
                        </button>
                    </div>
                </div>
            </div>
        </section>
    );
}
