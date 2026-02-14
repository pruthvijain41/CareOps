"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useWorkspaceStore, type Permissions } from "@/stores/workspace-store";
import { useParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getDashboardMetrics, getActionFeed, getIntegrationStatus, getInsights, listForms } from "@/lib/api";

import {
    Loader2, AlertCircle, CalendarDays, MessageSquare, ClipboardList, Package,
    CheckCircle2, Circle, X, ChevronRight, ArrowRight,
    TrendingUp, TrendingDown, Lightbulb, AlertTriangle, Sparkles, RefreshCcw,
    Plus, Users, FileText, ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
} from "recharts";

/* ── Types ─────────────────────────────────────────────── */

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

interface TeamMember {
    id: string;
    name: string;
    avatar?: string;
    role: string;
    status: "online" | "offline" | "busy";
    currentTask?: string;
}

interface FormItem {
    id: string;
    title: string;
    slug: string;
    is_active: boolean;
    created_at: string;
}

/* ── Constants ─────────────────────────────────────────── */

const STAT_CONFIG = [
    { title: "Bookings Today", key: "bookings_today", icon: CalendarDays, permKey: "bookings" as keyof Permissions },
    { title: "New Messages", key: "unread_messages", icon: MessageSquare, permKey: "inbox" as keyof Permissions },
    { title: "Form Submissions", key: "pending_forms", icon: ClipboardList, permKey: "forms" as keyof Permissions },
    { title: "Low Stock", key: "low_stock_items", icon: Package, permKey: "inventory" as keyof Permissions },
] as const;

/* Palette-matched chart colors */
const CHART_COLORS = {
    bookings: "#0f172a",   // Charcoal (Primary)
    revenue: "#059669",    // Emerald-600 (Success)
    completed: "#059669",  // Emerald-600
    upcoming: "#0f172a",   // Charcoal
    cancelled: "#e11d48",  // Rose-600 (Error)
};

const INSIGHT_ICONS: Record<string, any> = {
    trend_up: TrendingUp,
    trend_down: TrendingDown,
    lightbulb: Lightbulb,
    alert: AlertTriangle,
};

const INSIGHT_COLORS: Record<string, string> = {
    trend_up: "bg-emerald-500/10 text-emerald-400",
    trend_down: "bg-rose-500/10 text-rose-400",
    lightbulb: "bg-amber-500/10 text-amber-400",
    alert: "bg-rose-500/10 text-rose-400",
};

const STATUS_COLORS = {
    online: "bg-emerald-500",
    offline: "bg-slate-300",
    busy: "bg-amber-500",
};

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

/* ── Page Component ────────────────────────────────────── */

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

    /* ── Data fetching ────────────────────────────────── */

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
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    const { data: teamMembers } = useQuery<TeamMember[]>({
        queryKey: ["team-members"],
        queryFn: async () => {
            const { data } = await supabase
                .from("profiles")
                .select("id, full_name, avatar_url, role")
                .eq("workspace_id", profile?.workspaceId)
                .limit(6);
            return data?.map((m: any) => ({
                id: m.id,
                name: m.full_name,
                avatar: m.avatar_url,
                role: m.role,
                status: ["online", "busy", "offline"][Math.floor(Math.random() * 3)] as "online" | "offline" | "busy",
                currentTask: ["Processing bookings", "Replying to messages", "Inventory check", "Form review"][Math.floor(Math.random() * 4)],
            })) || [];
        },
        enabled: !!profile?.workspaceId && isOwner,
    });

    // Fetch forms created by the owner
    const { data: forms } = useQuery<FormItem[]>({
        queryKey: ["workspace-forms"],
        queryFn: listForms,
        enabled: !!profile?.workspaceId,
    });

    const recentForms = (forms || []).slice(0, 3);

    /* ── Realtime subscriptions ───────────────────────── */

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

    /* ── Setup Checklist (owners only) ────────────────── */

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

    /* ── Render ────────────────────────────────────────── */

    return (
        <div className="space-y-8 pb-16 max-w-[1400px] mx-auto">

            {/* ── Setup Checklist ────────────────────────── */}
            {isOwner && !checklistDismissed && !allDone && (
                <div className="rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white to-slate-50/50 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-slate-100/80">
                        <div className="flex items-center gap-4">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-sm tracking-tight text-slate-900">
                                    Complete Your Setup
                                </h3>
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5">{completedCount} of {setupItems.length} steps completed</p>
                            </div>
                        </div>
                        <button
                            onClick={dismissChecklist}
                            className="text-slate-300 hover:text-slate-500 transition-colors rounded-lg p-1.5 hover:bg-slate-100"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>

                    <div className="px-6 pt-4">
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 rounded-full transition-all duration-700"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>
                    </div>

                    <div className="p-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
                        {setupItems.map((item) => (
                            <Link
                                key={item.label}
                                href={item.href}
                                className={`px-4 py-3 rounded-xl flex items-center gap-3 transition-all group ${item.done ? "opacity-40" : "hover:bg-white hover:shadow-sm"}`}
                            >
                                {item.done ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                ) : (
                                    <Circle className="w-4 h-4 text-slate-200 shrink-0 group-hover:text-slate-300" />
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


            {/* ── Header ─────────────────────────────────── */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 pt-1">
                <div>
                    <p className="text-[12px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                        {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>
                    <h1 className="text-2xl font-display font-bold tracking-tight text-slate-900">
                        {getGreeting()}, {firstName}
                    </h1>
                </div>
                <Button asChild className="rounded-xl px-6 bg-slate-900 text-white hover:bg-slate-800 h-10 text-[13px] font-semibold gap-2 shadow-sm">
                    <Link href={`/${slug}/bookings`}>
                        <Plus className="w-4 h-4" />
                        New Booking
                    </Link>
                </Button>
            </div>


            {/* ── Stat Cards ─────────────────────────────── */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {STAT_CONFIG.filter((stat) => hasPermission(stat.permKey)).map((stat, idx) => {
                    const Icon = stat.icon;
                    const value = metrics?.[stat.key] ?? 0;
                    const isFirst = idx === 0;

                    return (
                        <div
                            key={stat.key}
                            className={`rounded-2xl p-5 transition-all duration-200 ${isFirst
                                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                                    : "bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                                }`}
                        >
                            <div className="flex items-center justify-between mb-4">
                                <span className={`text-[11px] font-semibold uppercase tracking-wider ${isFirst ? "text-slate-400" : "text-slate-400"}`}>
                                    {stat.title}
                                </span>
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isFirst ? "bg-white/10" : "bg-slate-50"}`}>
                                    <Icon className={`w-4 h-4 ${isFirst ? "text-emerald-400" : "text-slate-400"}`} />
                                </div>
                            </div>
                            {metricsLoading ? (
                                <Loader2 className={`w-5 h-5 animate-spin ${isFirst ? "text-slate-500" : "text-slate-200"}`} />
                            ) : (
                                <span className={`text-3xl font-bold tracking-tight ${isFirst ? "text-white" : "text-slate-900"}`}>
                                    {value}
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>


            {/* ── Main Content Grid ──────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

                {/* ── Left Column (2/3) ──────────────── */}
                <div className="lg:col-span-2 space-y-6">

                    {/* This Week — Bar Chart */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div>
                                <h3 className="font-display font-bold text-[15px] tracking-tight text-slate-900">This Week</h3>
                                <p className="text-[12px] text-slate-400 mt-0.5 font-medium">Bookings and revenue over the last 7 days</p>
                            </div>
                            <div className="flex items-center gap-5">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.bookings }} />
                                    <span className="text-[11px] font-medium text-slate-400">Bookings</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <div className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: CHART_COLORS.revenue }} />
                                    <span className="text-[11px] font-medium text-slate-400">Revenue</span>
                                </div>
                            </div>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                <BarChart data={metrics?.weekly_analytics || []} barGap={4} barCategoryGap="20%">
                                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                    <XAxis
                                        dataKey="day"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                                        dy={8}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
                                        width={36}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#f8fafc', radius: 4 }}
                                        contentStyle={{
                                            backgroundColor: '#fff',
                                            border: '1px solid #e2e8f0',
                                            borderRadius: '10px',
                                            boxShadow: '0 4px 16px rgb(0 0 0 / 0.06)',
                                            fontSize: '12px',
                                            fontWeight: 500,
                                        }}
                                    />
                                    <Bar
                                        dataKey="bookings"
                                        fill={CHART_COLORS.bookings}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={24}
                                    />
                                    <Bar
                                        dataKey="revenue"
                                        fill={CHART_COLORS.revenue}
                                        radius={[4, 4, 0, 0]}
                                        maxBarSize={24}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Action Required */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <h3 className="font-display font-bold text-[15px] tracking-tight text-slate-900">
                                    Action Required
                                </h3>
                                {(actions?.length ?? 0) > 0 && (
                                    <span className="px-2 py-0.5 rounded-full bg-rose-500 text-white text-[10px] font-bold min-w-[20px] text-center">
                                        {actions?.length}
                                    </span>
                                )}
                            </div>
                        </div>
                        <div>
                            {actionsLoading ? (
                                <div className="p-10 flex items-center justify-center gap-3">
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                    <span className="text-[12px] font-medium text-slate-400">Loading...</span>
                                </div>
                            ) : actions?.length === 0 ? (
                                <div className="p-10 text-center">
                                    <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                                        <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                    </div>
                                    <p className="text-[13px] font-semibold text-slate-900">All clear</p>
                                    <p className="text-[12px] text-slate-400 font-medium mt-1">Nothing needs your attention right now.</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-slate-50">
                                    {actions?.slice(0, 5).map((action) => {
                                        const href = ACTION_ROUTES[action.type] || `/${slug}`;
                                        return (
                                            <Link
                                                key={action.id}
                                                href={href}
                                                className="px-6 py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors group"
                                            >
                                                <div className="flex gap-3 items-start">
                                                    <div className={`mt-1 w-2 h-2 rounded-full shrink-0 ${action.severity === 'rose'
                                                        ? 'bg-rose-500'
                                                        : 'bg-amber-500'
                                                        }`} />
                                                    <div>
                                                        <p className="text-[13px] font-semibold text-slate-800 tracking-tight leading-tight">{action.title}</p>
                                                        <p className="text-[11px] text-slate-400 font-medium mt-0.5">{action.description}</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0">
                                                    <span className="text-[10px] text-slate-300 font-medium tabular-nums">
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
                </div>


                {/* ── Right Column (1/3) ─────────────── */}
                <div className="space-y-6">

                    {/* Booking Overview — Donut */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
                        <h3 className="font-display font-bold text-[15px] tracking-tight text-slate-900 mb-5">Booking Overview</h3>
                        <div className="flex flex-col items-center">
                            <div className="relative w-36 h-36">
                                <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                                    <PieChart>
                                        <Pie
                                            data={metrics?.booking_distribution || []}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={48}
                                            outerRadius={66}
                                            startAngle={90}
                                            endAngle={-270}
                                            paddingAngle={3}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            {(metrics?.booking_distribution || []).map((_: any, index: number) => {
                                                const paletteColors = [CHART_COLORS.completed, CHART_COLORS.upcoming, CHART_COLORS.cancelled];
                                                return <Cell key={`cell-${index}`} fill={paletteColors[index % paletteColors.length]} />;
                                            })}
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-2xl font-bold text-slate-900 tracking-tight tabular-nums">{metrics?.completion_rate || 0}%</span>
                                    <span className="text-[10px] text-slate-400 font-medium mt-0.5">Completed</span>
                                </div>
                            </div>
                            <div className="flex gap-5 mt-5">
                                {[
                                    { label: "Completed", color: CHART_COLORS.completed },
                                    { label: "Upcoming", color: CHART_COLORS.upcoming },
                                    { label: "Cancelled", color: CHART_COLORS.cancelled },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center gap-1.5">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                        <span className="text-[11px] font-medium text-slate-400">{item.label}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Your Forms */}
                    <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-display font-bold text-[15px] tracking-tight text-slate-900">Your Forms</h3>
                            <Link href={`/${slug}/forms`}>
                                <button className="text-[12px] font-semibold text-slate-400 hover:text-slate-600 transition-colors">
                                    View All
                                </button>
                            </Link>
                        </div>
                        <div className="space-y-2">
                            {recentForms.map((form) => (
                                <div key={form.id} className="p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors group">
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex items-center gap-2.5 min-w-0">
                                            <FileText className="w-4 h-4 text-slate-300 shrink-0" />
                                            <p className="text-[13px] font-semibold text-slate-800 tracking-tight truncate">
                                                {form.title || "Untitled Form"}
                                            </p>
                                        </div>
                                        <Badge variant="secondary" className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${form.is_active ? "bg-emerald-50 text-emerald-600" : "bg-slate-50 text-slate-400"}`}>
                                            {form.is_active ? "Live" : "Draft"}
                                        </Badge>
                                    </div>
                                    <p className="text-[11px] text-slate-400 font-medium mt-1.5 ml-[26px]">
                                        Created {new Date(form.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </p>
                                </div>
                            ))}
                            {recentForms.length === 0 && (
                                <div className="text-center py-8">
                                    <div className="w-10 h-10 rounded-lg bg-slate-50 flex items-center justify-center mx-auto mb-2">
                                        <FileText className="w-5 h-5 text-slate-300" />
                                    </div>
                                    <p className="text-[12px] text-slate-400 font-medium">No forms created yet</p>
                                    <Link href={`/${slug}/forms`}>
                                        <button className="text-[12px] font-semibold text-emerald-600 hover:text-emerald-700 mt-2 transition-colors">
                                            Create your first form
                                        </button>
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Quick Access */}
                    <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 p-5">
                        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-3">Quick Access</h3>
                        <div className="space-y-0.5">
                            {[
                                { label: "Bookings", href: `/${slug}/bookings`, icon: CalendarDays },
                                { label: "Inventory", href: `/${slug}/inventory`, icon: Package },
                                { label: "Inbox", href: `/${slug}/inbox`, icon: MessageSquare },
                            ].map((link) => (
                                <Link
                                    key={link.label}
                                    href={link.href}
                                    className="flex items-center justify-between p-2.5 rounded-lg hover:bg-white transition-colors group"
                                >
                                    <div className="flex items-center gap-2.5">
                                        <link.icon className="w-4 h-4 text-slate-400 group-hover:text-slate-600 transition-colors" />
                                        <span className="text-[13px] font-medium text-slate-600 group-hover:text-slate-900">{link.label}</span>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-200 group-hover:text-slate-400 transition-colors" />
                                </Link>
                            ))}
                        </div>
                    </div>
                </div>
            </div>


            {/* ── Your Team (owners only, full width) ──── */}
            {isOwner && (teamMembers?.length ?? 0) > 0 && (
                <div className="rounded-2xl border border-slate-200/80 bg-white p-6">
                    <div className="flex items-center justify-between mb-5">
                        <h3 className="font-display font-bold text-[15px] tracking-tight text-slate-900">Your Team</h3>
                        <Link href={`/${slug}/staff`}>
                            <Button variant="ghost" size="sm" className="rounded-lg gap-1.5 font-semibold text-slate-400 hover:text-slate-600 text-[12px] h-8">
                                <Plus className="w-3.5 h-3.5" />
                                Add Member
                            </Button>
                        </Link>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {(teamMembers || []).map((member) => (
                            <div key={member.id} className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition-colors">
                                <div className="relative">
                                    <Avatar className="w-9 h-9 rounded-lg">
                                        <AvatarImage src={member.avatar} />
                                        <AvatarFallback className="bg-slate-100 text-slate-500 font-semibold text-[11px] rounded-lg">
                                            {member.name.split(" ").map(n => n[0]).join("")}
                                        </AvatarFallback>
                                    </Avatar>
                                    <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-white ${STATUS_COLORS[member.status]}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-800 truncate">{member.name}</p>
                                    <p className="text-[11px] text-slate-400 font-medium truncate capitalize">{member.role}</p>
                                </div>
                                <Badge
                                    variant="secondary"
                                    className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${member.status === "online" ? "bg-emerald-50 text-emerald-600" :
                                        member.status === "busy" ? "bg-amber-50 text-amber-600" :
                                            "bg-slate-50 text-slate-400"
                                        }`}
                                >
                                    {member.status}
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}


            {/* ── Insights (owners only, full width) ───── */}
            {isOwner && (
                <div className="rounded-2xl bg-slate-900 overflow-hidden shadow-lg shadow-slate-900/5">
                    <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                            </div>
                            <div>
                                <h3 className="font-display font-bold text-[15px] tracking-tight text-white">Insights</h3>
                                <p className="text-[11px] text-slate-500 font-medium mt-0.5">AI-generated suggestions for {profile?.workspaceName}</p>
                            </div>
                        </div>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="rounded-lg h-8 px-3 text-[12px] font-medium text-slate-400 hover:text-white hover:bg-white/10 gap-1.5"
                            onClick={() => refetchInsights()}
                            disabled={insightsLoading}
                        >
                            <RefreshCcw className={`w-3.5 h-3.5 ${insightsLoading ? "animate-spin" : ""}`} />
                            Refresh
                        </Button>
                    </div>

                    <div className="p-6">
                        {insightsLoading ? (
                            <div className="flex items-center justify-center py-10 gap-3">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-500" />
                                <span className="text-[12px] text-slate-500 font-medium">Loading insights...</span>
                            </div>
                        ) : !insights || insights.length === 0 ? (
                            <div className="py-10 text-center">
                                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center mx-auto mb-3">
                                    <Lightbulb className="w-6 h-6 text-slate-600" />
                                </div>
                                <p className="text-[13px] font-medium text-slate-500 max-w-xs mx-auto">
                                    Not enough data yet. More activity will unlock insights.
                                </p>
                            </div>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-1 lg:grid-cols-3">
                                {insights.map((insight, i) => {
                                    const IconComponent = INSIGHT_ICONS[insight.icon_type] || Lightbulb;
                                    const colorClass = INSIGHT_COLORS[insight.icon_type] || "bg-slate-800 text-slate-400";

                                    return (
                                        <div
                                            key={i}
                                            className="flex flex-col gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/[0.06] hover:bg-white/[0.07] transition-colors"
                                        >
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colorClass}`}>
                                                <IconComponent className="w-4 h-4" />
                                            </div>
                                            <p className="text-[12px] text-slate-300 font-medium leading-relaxed">
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
