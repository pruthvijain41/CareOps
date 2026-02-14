"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore, type Permissions } from "@/stores/workspace-store";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getDashboardMetrics, getActionFeed, getIntegrationStatus, getInsights } from "@/lib/api";
import {
    Loader2, AlertCircle, CalendarDays, MessageSquare, ClipboardList, Package,
    CheckCircle2, Circle, X, ChevronRight, ArrowRight, Clock, Activity,
    TrendingUp, TrendingDown, Lightbulb, AlertTriangle, Sparkles, RefreshCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface ActionItem {
    id: string;
    type: string;
    title: string;
    description: string;
    severity: "rose" | "amber";
    timestamp: string;
}

interface InsightItem {
    text: string;
    icon_type: string;
}

const STAT_CONFIG = [
    { title: "Today's Bookings", key: "bookings_today", icon: CalendarDays, accent: "bg-blue-50 text-blue-600", border: "border-blue-100", permKey: "bookings" as keyof Permissions },
    { title: "Unread Messages", key: "unread_messages", icon: MessageSquare, accent: "bg-amber-50 text-amber-600", border: "border-amber-100", permKey: "inbox" as keyof Permissions },
    { title: "Pending Forms", key: "pending_forms", icon: ClipboardList, accent: "bg-violet-50 text-violet-600", border: "border-violet-100", permKey: "forms" as keyof Permissions },
    { title: "Low Stock Items", key: "low_stock_items", icon: Package, accent: "bg-rose-50 text-rose-600", border: "border-rose-100", permKey: "inventory" as keyof Permissions },
] as const;

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

const INSIGHT_ICONS: Record<string, any> = {
    trend_up: TrendingUp,
    trend_down: TrendingDown,
    lightbulb: Lightbulb,
    alert: AlertTriangle,
    clock: Clock,
};

const INSIGHT_COLORS: Record<string, string> = {
    trend_up: "bg-emerald-50 text-emerald-600",
    trend_down: "bg-rose-50 text-rose-500",
    lightbulb: "bg-amber-50 text-amber-600",
    alert: "bg-rose-50 text-rose-500",
    clock: "bg-blue-50 text-blue-600",
};

export default function DashboardPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const hasPermission = useWorkspaceStore((s) => s.hasPermission);
    const queryClient = useQueryClient();
    const supabase = createClient();
    const params = useParams<{ workspaceSlug: string }>();
    const slug = params.workspaceSlug;
    const isOwner = profile?.role === "owner";
    const firstName = profile?.fullName?.split(" ")[0] ?? "there";

    const ACTION_ROUTES: Record<string, string> = {
        low_stock: `/${slug}/inventory`,
        inventory_alert: `/${slug}/inventory`,
        unread_message: `/${slug}/inbox`,
        pending_booking: `/${slug}/bookings`,
        pending_form: `/${slug}/forms`,
        lead: `/${slug}/forms`,
    };

    const { data: metrics, isLoading: metricsLoading } = useQuery({
        queryKey: ["dashboard-metrics"],
        queryFn: getDashboardMetrics,
        refetchInterval: 30000,
    });

    const { data: actions, isLoading: actionsLoading } = useQuery<ActionItem[]>({
        queryKey: ["dashboard-actions"],
        queryFn: getActionFeed,
        refetchInterval: 60000,
    });

    const { data: insights, isLoading: insightsLoading, refetch: refetchInsights } = useQuery<InsightItem[]>({
        queryKey: ["dashboard-insights"],
        queryFn: getInsights,
        staleTime: 5 * 60 * 1000, // 5 minutes
        refetchOnWindowFocus: false,
    });

    useEffect(() => {
        const channel = supabase
            .channel('dashboard-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
                queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, () => {
                queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory_items' }, () => {
                queryClient.invalidateQueries({ queryKey: ["dashboard-metrics"] });
                queryClient.invalidateQueries({ queryKey: ["dashboard-actions"] });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [supabase, queryClient]);

    // ── Setup Checklist (owners only) ──────────────────────────────────────
    const [checklistDismissed, setChecklistDismissed] = useState(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("careops_checklist_dismissed") === "true";
        }
        return false;
    });

    const { data: integrationStatus } = useQuery({
        queryKey: ["integration-status"],
        queryFn: getIntegrationStatus,
        enabled: isOwner && !checklistDismissed,
    });

    const gmailConnected = integrationStatus?.gmail?.connected === true;

    const { data: servicesData } = useQuery({
        queryKey: ["services-check"],
        queryFn: async () => {
            const { data } = await supabase.from("services").select("id").limit(1);
            return data;
        },
        enabled: isOwner && !checklistDismissed,
    });

    const { data: staffData } = useQuery({
        queryKey: ["staff-check"],
        queryFn: async () => {
            const { data } = await supabase.from("profiles").select("id").eq("role", "staff").limit(1);
            return data;
        },
        enabled: isOwner && !checklistDismissed,
    });

    const { data: workspaceData } = useQuery({
        queryKey: ["workspace-settings-check"],
        queryFn: async () => {
            const { data } = await supabase.from("workspaces").select("settings").eq("slug", slug).single();
            return data;
        },
        enabled: isOwner && !checklistDismissed,
    });

    const hasSchedule = workspaceData?.settings?.schedule && Object.keys(workspaceData.settings.schedule).length > 0;

    const setupItems = [
        { label: "Set up business identity", done: true, href: `/${slug}/settings` },
        { label: "Connect your Gmail", done: gmailConnected, href: `/${slug}/settings` },
        { label: "Add your first service", done: (servicesData?.length ?? 0) > 0, href: `/${slug}/bookings` },
        { label: "Configure working hours", done: !!hasSchedule, href: `/${slug}/bookings` },
        { label: "Create a contact form", done: false, href: `/${slug}/forms` },
        { label: "Invite a team member", done: (staffData?.length ?? 0) > 0, href: `/${slug}/staff` },
    ];
    const completedCount = setupItems.filter((i) => i.done).length;
    const allDone = completedCount === setupItems.length;
    const progressPercent = Math.round((completedCount / setupItems.length) * 100);

    const dismissChecklist = () => {
        setChecklistDismissed(true);
        localStorage.setItem("careops_checklist_dismissed", "true");
    };

    return (
        <div className="space-y-6">
            {/* ── Setup Checklist ────────────────────────────────────── */}
            {isOwner && !checklistDismissed && !allDone && (
                <div className="rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
                        <div className="flex items-center gap-4">
                            <h3 className="font-display font-bold text-sm tracking-tight text-slate-900">
                                Complete Your Setup
                            </h3>
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                                {completedCount} of {setupItems.length}
                            </span>
                        </div>
                        <button
                            onClick={dismissChecklist}
                            className="text-slate-300 hover:text-slate-500 transition-colors rounded-lg p-1"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    {/* Progress bar */}
                    <div className="px-6 pt-4">
                        <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                        <p className="text-[11px] text-slate-400 font-medium mt-2">{progressPercent}% complete</p>
                    </div>

                    <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {setupItems.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={`px-4 py-3 rounded-xl flex items-center gap-3 transition-all group ${item.done ? "opacity-50" : "hover:bg-slate-50"
                                    }`}
                            >
                                {item.done ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                    <Circle className="w-4 h-4 text-slate-200 shrink-0" />
                                )}
                                <span className={`text-[13px] flex-1 tracking-tight ${item.done ? "text-slate-400 line-through" : "text-slate-700 font-medium"}`}>
                                    {item.label}
                                </span>
                                {!item.done && (
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                )}
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Greeting ──────────────────────────────────────────── */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-display font-black tracking-tight text-slate-900 leading-none">
                        {getGreeting()}, {firstName}
                    </h1>
                    <p className="text-sm text-slate-400 font-medium mt-2 tracking-tight">
                        {new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                        {" · "}Here&apos;s what&apos;s happening today.
                    </p>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-slate-50 rounded-full border border-slate-100">
                    <div className="relative">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute inset-0 opacity-40" />
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Live</span>
                </div>
            </div>

            {/* ── Stat Cards (Reference-inspired: first card highlighted) ── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STAT_CONFIG.filter((stat) => hasPermission(stat.permKey)).map((stat, index) => {
                    const Icon = stat.icon;
                    const value = metrics?.[stat.key] ?? 0;
                    const isHighlighted = index === 0;

                    return (
                        <div
                            key={stat.key}
                            className={`group rounded-2xl p-5 transition-all duration-300 ${isHighlighted
                                    ? "bg-slate-900 text-white shadow-xl shadow-slate-300/30"
                                    : "bg-white border border-slate-100 hover:shadow-lg hover:shadow-slate-100/80"
                                }`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <span className={`text-[13px] font-semibold tracking-tight ${isHighlighted ? "text-slate-300" : "text-slate-500"
                                    }`}>
                                    {stat.title}
                                </span>
                                <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${isHighlighted ? "bg-white/10 text-white" : stat.accent
                                    }`}>
                                    <Icon className="w-4 h-4" />
                                </div>
                            </div>
                            <div className="flex items-baseline gap-2">
                                {metricsLoading ? (
                                    <Loader2 className={`w-5 h-5 animate-spin ${isHighlighted ? "text-slate-400" : "text-slate-200"}`} />
                                ) : (
                                    <span className={`text-3xl font-display font-black tracking-tighter ${isHighlighted ? "text-white" : "text-slate-900"
                                        }`}>
                                        {value}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* ── Main Grid: 3-column layout ────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                {/* ── Needs Your Attention (2 cols) ── */}
                <div className="lg:col-span-2 rounded-2xl border border-slate-100 bg-white overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <h3 className="font-display font-bold text-sm tracking-tight text-slate-900">
                                Needs Your Attention
                            </h3>
                            {(actions?.length ?? 0) > 0 && (
                                <span className="w-5 h-5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
                                    {actions?.length}
                                </span>
                            )}
                        </div>
                        <AlertCircle className="w-4 h-4 text-slate-300" />
                    </div>
                    <div>
                        {actionsLoading ? (
                            <div className="p-16 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-6 h-6 animate-spin text-slate-200" />
                                <span className="text-[11px] font-medium text-slate-300">Loading alerts...</span>
                            </div>
                        ) : actions?.length === 0 ? (
                            <div className="p-16 text-center">
                                <div className="w-12 h-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                                </div>
                                <p className="text-sm font-semibold text-slate-900 tracking-tight">All clear</p>
                                <p className="text-[13px] text-slate-400 font-medium mt-1">Nothing needs your attention right now.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-50">
                                {actions?.map((action) => {
                                    const href = ACTION_ROUTES[action.type] || `/${slug}`;
                                    return (
                                        <Link
                                            key={action.id}
                                            href={href}
                                            className="px-6 py-4 flex items-start justify-between gap-4 hover:bg-slate-50/50 transition-colors group"
                                        >
                                            <div className="flex gap-3">
                                                <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${action.severity === 'rose'
                                                    ? 'bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]'
                                                    : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                                                    }`} />
                                                <div>
                                                    <p className="text-[13px] font-semibold text-slate-900 tracking-tight">{action.title}</p>
                                                    <p className="text-[12px] text-slate-400 font-medium mt-0.5">{action.description}</p>
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                <span className="text-[11px] text-slate-300 font-medium">
                                                    {new Date(action.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                                <ArrowRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* ── Right Column: System Health + Quick Links ── */}
                <div className="space-y-5">
                    {/* System Health */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-6">
                        <div className="flex items-center gap-3 mb-5">
                            <Activity className="w-4 h-4 text-slate-400" />
                            <h3 className="font-display font-bold text-sm tracking-tight text-slate-900">System Health</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-[12px] mb-1.5">
                                    <span className="font-medium text-slate-500">Uptime</span>
                                    <span className="font-bold text-emerald-600">99.9%</span>
                                </div>
                                <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                    <div className="h-full bg-emerald-500 rounded-full w-[99.9%]" />
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-[12px] mb-1.5">
                                    <span className="font-medium text-slate-500">Response Time</span>
                                    <span className="font-bold text-slate-900">42ms</span>
                                </div>
                                <div className="h-1.5 bg-slate-50 rounded-full overflow-hidden">
                                    <div className="h-full bg-blue-500 rounded-full w-[15%]" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* All Systems Operational */}
                    <div className="rounded-2xl border border-emerald-100 bg-emerald-50/30 p-5">
                        <div className="flex items-center gap-2.5 mb-2">
                            <div className="relative">
                                <div className="w-2 h-2 rounded-full bg-emerald-500 animate-ping absolute inset-0 opacity-30" />
                                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                            </div>
                            <span className="text-[13px] font-bold text-emerald-700 tracking-tight">All Systems Operational</span>
                        </div>
                        <p className="text-[12px] text-emerald-600/70 font-medium leading-relaxed">
                            Your workspace is running smoothly. Real-time sync is active.
                        </p>
                    </div>

                    {/* Quick Links */}
                    <div className="rounded-2xl border border-slate-100 bg-white p-5">
                        <h3 className="font-display font-bold text-sm tracking-tight text-slate-900 mb-3">Quick Links</h3>
                        <div className="space-y-1">
                            {[
                                { label: "Manage Bookings", href: `/${slug}/bookings`, icon: CalendarDays },
                                { label: "Check Inbox", href: `/${slug}/inbox`, icon: MessageSquare },
                                { label: "View Inventory", href: `/${slug}/inventory`, icon: Package },
                                { label: "Review Forms", href: `/${slug}/forms`, icon: ClipboardList },
                            ].map((link) => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors group"
                                >
                                    <link.icon className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
                                    <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900 transition-colors flex-1">{link.label}</span>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── AI Smart Insights ─────────────────────────────────── */}
            {isOwner && (
                <div className="rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden shadow-xl shadow-slate-300/20">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-sm tracking-tight text-white">
                                    Smart Insights
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium">AI-powered analysis of your workspace data</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-xl h-8 text-[11px] font-semibold text-slate-400 hover:text-white hover:bg-white/10 gap-1.5"
                            onClick={() => refetchInsights()}
                            disabled={insightsLoading}
                        >
                            <RefreshCcw className={`w-3 h-3 ${insightsLoading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>

                    <div className="p-6">
                        {insightsLoading ? (
                            <div className="flex items-center justify-center py-8 gap-3">
                                <div className="flex gap-1">
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <div className="w-2 h-2 rounded-full bg-amber-400 animate-bounce" style={{ animationDelay: "300ms" }} />
                                </div>
                                <span className="text-[13px] text-slate-400 font-medium">Analyzing your data...</span>
                            </div>
                        ) : !insights || insights.length === 0 ? (
                            <div className="py-8 text-center">
                                <Lightbulb className="w-8 h-8 text-slate-600 mx-auto mb-3" />
                                <p className="text-[13px] text-slate-400 font-medium">
                                    No insights available yet. Add more data to get personalized recommendations.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
                                {insights.map((insight, i) => {
                                    const IconComponent = INSIGHT_ICONS[insight.icon_type] || Lightbulb;
                                    const colorClass = INSIGHT_COLORS[insight.icon_type] || "bg-slate-700 text-slate-400";

                                    return (
                                        <div
                                            key={i}
                                            className="flex items-start gap-3.5 p-4 rounded-xl bg-white/5 border border-white/5 hover:bg-white/[0.08] transition-colors"
                                        >
                                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${colorClass}`}>
                                                <IconComponent className="w-4.5 h-4.5" />
                                            </div>
                                            <p className="text-[13px] text-slate-300 font-medium leading-relaxed">
                                                {insight.text}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
