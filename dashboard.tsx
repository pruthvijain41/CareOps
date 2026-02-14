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
    Search, Bell, Mail, Plus, Download, MoreHorizontal, Play, Square,
    Users, Briefcase, Phone, MapPin, Calendar, FileText, Settings,
    ArrowUpRight, Pause
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

interface Reminder {
    id: string;
    title: string;
    time: string;
    type: "meeting" | "task" | "followup";
}

interface Project {
    id: string;
    name: string;
    dueDate: string;
    status: "completed" | "in-progress" | "pending";
    icon: string;
}

const STAT_CONFIG = [
    { title: "Today's Bookings", key: "bookings_today", icon: CalendarDays, trend: "+12%", trendUp: true, permKey: "bookings" as keyof Permissions },
    { title: "Unread Messages", key: "unread_messages", icon: MessageSquare, trend: "+5%", trendUp: true, permKey: "inbox" as keyof Permissions },
    { title: "Pending Forms", key: "pending_forms", icon: ClipboardList, trend: "-2%", trendUp: false, permKey: "forms" as keyof Permissions },
    { title: "Low Stock Items", key: "low_stock_items", icon: Package, trend: "+8%", trendUp: false, permKey: "inventory" as keyof Permissions },
] as const;

const WEEKLY_DATA = [
    { day: "Mon", bookings: 12, revenue: 2400 },
    { day: "Tue", bookings: 18, revenue: 3600 },
    { day: "Wed", bookings: 15, revenue: 3000 },
    { day: "Thu", bookings: 22, revenue: 4400 },
    { day: "Fri", bookings: 28, revenue: 5600 },
    { day: "Sat", bookings: 35, revenue: 7000 },
    { day: "Sun", bookings: 20, revenue: 4000 },
];

const PROJECT_STATUS_DATA = [
    { name: "Completed", value: 41, color: "#10b981" },
    { name: "In Progress", value: 35, color: "#3b82f6" },
    { name: "Pending", value: 24, color: "#f59e0b" },
];

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

const STATUS_COLORS = {
    online: "bg-emerald-500",
    offline: "bg-slate-300",
    busy: "bg-amber-500",
};

const PROJECT_ICONS: Record<string, any> = {
    api: Briefcase,
    onboarding: Users,
    dashboard: LayoutDashboard,
    performance: TrendingUp,
    testing: CheckCircle2,
};

import { LayoutDashboard } from "lucide-react";

function getGreeting(): string {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
}

function formatTime(seconds: number): string {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hrs.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export default function DashboardPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const hasPermission = useWorkspaceStore((s) => s.hasPermission);
    const queryClient = useQueryClient();
    const supabase = createClient();
    const params = useParams<{ workspaceSlug: string }>();
    const slug = params.workspaceSlug;
    const isOwner = profile?.role === "owner";
    const firstName = profile?.fullName?.split(" ")[0] ?? "there";

    const [timeTracker, setTimeTracker] = useState(5068); // 1:24:08 in seconds
    const [isTracking, setIsTracking] = useState(false);

    // Time tracker effect
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isTracking) {
            interval = setInterval(() => {
                setTimeTracker((prev) => prev + 1);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isTracking]);

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
        staleTime: 5 * 60 * 1000,
        refetchOnWindowFocus: false,
    });

    // Fetch team members
    const { data: teamMembers } = useQuery<TeamMember[]>({
        queryKey: ["team-members"],
        queryFn: async () => {
            const { data } = await supabase
                .from("profiles")
                .select("id, full_name, avatar_url, role")
                .eq("workspace_slug", slug)
                .limit(4);
            return data?.map((m: any) => ({
                id: m.id,
                name: m.full_name,
                avatar: m.avatar_url,
                role: m.role,
                status: ["online", "busy", "offline"][Math.floor(Math.random() * 3)] as "online" | "offline" | "busy",
                currentTask: ["Processing bookings", "Replying to messages", "Inventory check", "Form review"][Math.floor(Math.random() * 4)],
            })) || [];
        },
        enabled: hasPermission("staff"),
    });

    // Fetch upcoming reminders
    const { data: reminders } = useQuery<Reminder[]>({
        queryKey: ["reminders"],
        queryFn: async () => {
            const { data } = await supabase
                .from("bookings")
                .select("id, customer_name, start_time")
                .eq("workspace_slug", slug)
                .gte("start_time", new Date().toISOString())
                .order("start_time", { ascending: true })
                .limit(3);
            return data?.map((r: any) => ({
                id: r.id,
                title: `Meeting with ${r.customer_name}`,
                time: new Date(r.start_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                type: "meeting" as const,
            })) || [
                { id: "1", title: "Team Standup", time: "09:00 AM", type: "meeting" },
                { id: "2", title: "Client Follow-up", time: "02:30 PM", type: "followup" },
            ];
        },
    });

    // Fetch recent projects/tasks
    const { data: projects } = useQuery<Project[]>({
        queryKey: ["recent-projects"],
        queryFn: async () => {
            return [
                { id: "1", name: "Process New Bookings", dueDate: "Today", status: "in-progress", icon: "api" },
                { id: "2", name: "Reply to Client Messages", dueDate: "Today", status: "pending", icon: "onboarding" },
                { id: "3", name: "Update Inventory Records", dueDate: "Tomorrow", status: "completed", icon: "dashboard" },
                { id: "4", name: "Review Form Submissions", dueDate: "Nov 28", status: "in-progress", icon: "performance" },
                { id: "5", name: "Weekly Report", dueDate: "Dec 5", status: "pending", icon: "testing" },
            ];
        },
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
        <div className="min-h-screen bg-slate-50/50">
            {/* ── Top Navigation Bar ────────────────────────────────────── */}
            <header className="bg-white border-b border-slate-100 sticky top-0 z-30">
                <div className="max-w-[1600px] mx-auto px-6 py-4">
                    <div className="flex items-center justify-between">
                        {/* Search */}
                        <div className="flex items-center gap-4 flex-1 max-w-xl">
                            <div className="relative flex-1">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                                <input
                                    type="text"
                                    placeholder="Search tasks, bookings, messages..."
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
                                />
                                <kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-2 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-medium text-slate-400">
                                    ⌘K
                                </kbd>
                            </div>
                        </div>

                        {/* Right Actions */}
                        <div className="flex items-center gap-3">
                            <button className="relative p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                                <Mail className="w-5 h-5 text-slate-500" />
                                {metrics?.unread_messages > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
                                )}
                            </button>
                            <button className="relative p-2.5 rounded-xl hover:bg-slate-50 transition-colors">
                                <Bell className="w-5 h-5 text-slate-500" />
                                {(actions?.length ?? 0) > 0 && (
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-amber-500 rounded-full" />
                                )}
                            </button>
                            <div className="flex items-center gap-3 pl-3 border-l border-slate-100">
                                <div className="text-right hidden sm:block">
                                    <p className="text-sm font-semibold text-slate-900">{profile?.fullName || "User"}</p>
                                    <p className="text-xs text-slate-500">{profile?.email || "user@careops.com"}</p>
                                </div>
                                <Avatar className="w-10 h-10 border-2 border-white shadow-sm">
                                    <AvatarImage src={profile?.avatar_url} />
                                    <AvatarFallback className="bg-emerald-100 text-emerald-700 font-semibold">
                                        {firstName.charAt(0).toUpperCase()}
                                    </AvatarFallback>
                                </Avatar>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* ── Main Content ──────────────────────────────────────────── */}
            <main className="max-w-[1600px] mx-auto px-6 py-8">
                {/* ── Setup Checklist ────────────────────────────────────── */}
                {isOwner && !checklistDismissed && !allDone && (
                    <div className="mb-8 rounded-2xl border border-slate-100 bg-white shadow-sm overflow-hidden animate-in fade-in slide-in-from-top-4 duration-500">
                        <div className="px-6 py-4 flex items-center justify-between border-b border-slate-50">
                            <div className="flex items-center gap-4">
                                <h3 className="font-semibold text-sm tracking-tight text-slate-900">
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
                                    className={`px-4 py-3 rounded-xl flex items-center gap-3 transition-all group ${item.done ? "opacity-50" : "hover:bg-slate-50"}`}
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

                {/* ── Header Section with Actions ───────────────────────── */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                            Dashboard
                        </h1>
                        <p className="text-sm text-slate-500 mt-1">
                            Plan, prioritize, and manage your care operations with ease.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl gap-2">
                            <Plus className="w-4 h-4" />
                            Add Booking
                        </Button>
                        <Button variant="outline" className="rounded-xl gap-2 border-slate-200">
                            <Download className="w-4 h-4" />
                            Export Data
                        </Button>
                    </div>
                </div>

                {/* ── Stat Cards Row ─────────────────────────────────────── */}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
                    {STAT_CONFIG.filter((stat) => hasPermission(stat.permKey)).map((stat, index) => {
                        const Icon = stat.icon;
                        const value = metrics?.[stat.key] ?? 0;
                        const isHighlighted = index === 0;

                        return (
                            <div
                                key={stat.key}
                                className={`group rounded-2xl p-5 transition-all duration-300 ${isHighlighted
                                    ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200"
                                    : "bg-white border border-slate-100 hover:shadow-lg hover:shadow-slate-100/80"
                                    }`}
                            >
                                <div className="flex items-center justify-between mb-4">
                                    <span className={`text-[13px] font-semibold tracking-tight ${isHighlighted ? "text-emerald-100" : "text-slate-500"}`}>
                                        {stat.title}
                                    </span>
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 ${isHighlighted ? "bg-white/20 text-white" : "bg-slate-50 text-slate-600"}`}>
                                        <Icon className="w-5 h-5" />
                                    </div>
                                </div>
                                <div className="flex items-end justify-between">
                                    <div>
                                        {metricsLoading ? (
                                            <Loader2 className={`w-6 h-6 animate-spin ${isHighlighted ? "text-emerald-200" : "text-slate-200"}`} />
                                        ) : (
                                            <span className={`text-3xl font-bold tracking-tight ${isHighlighted ? "text-white" : "text-slate-900"}`}>
                                                {value}
                                            </span>
                                        )}
                                    </div>
                                    <div className={`flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded-full ${isHighlighted ? "bg-white/20 text-white" : stat.trendUp ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                                        {stat.trendUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                        {stat.trend}
                                    </div>
                                </div>
                                <p className={`text-[11px] mt-2 ${isHighlighted ? "text-emerald-100" : "text-slate-400"}`}>
                                    Increased from last month
                                </p>
                            </div>
                        );
                    })}
                </div>

                {/* ── Main Grid Layout ───────────────────────────────────── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* ── Left Column (2/3 width) ───────────────────────── */}
                    <div className="lg:col-span-2 space-y-6">
                        {/* Analytics Chart */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-6">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="font-semibold text-sm tracking-tight text-slate-900">Weekly Analytics</h3>
                                <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
                                        Bookings
                                    </Badge>
                                    <Badge variant="secondary" className="bg-blue-50 text-blue-700 hover:bg-blue-100">
                                        Revenue
                                    </Badge>
                                </div>
                            </div>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={WEEKLY_DATA} barGap={8}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                                        <XAxis 
                                            dataKey="day" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                                            dy={10}
                                        />
                                        <YAxis 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#94a3b8', fontSize: 12 }}
                                        />
                                        <Tooltip 
                                            contentStyle={{ 
                                                backgroundColor: '#fff', 
                                                border: '1px solid #e2e8f0', 
                                                borderRadius: '12px',
                                                boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                                            }}
                                        />
                                        <Bar 
                                            dataKey="bookings" 
                                            fill="#10b981" 
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={40}
                                        />
                                        <Bar 
                                            dataKey="revenue" 
                                            fill="#3b82f6" 
                                            radius={[8, 8, 0, 0]}
                                            maxBarSize={40}
                                        />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Team Collaboration */}
                        {hasPermission("staff") && (
                            <div className="rounded-2xl border border-slate-100 bg-white p-6">
                                <div className="flex items-center justify-between mb-5">
                                    <h3 className="font-semibold text-sm tracking-tight text-slate-900">Team Collaboration</h3>
                                    <Link href={`/${slug}/staff`}>
                                        <Button variant="outline" size="sm" className="rounded-lg gap-2 text-xs">
                                            <Plus className="w-3 h-3" />
                                            Add Member
                                        </Button>
                                    </Link>
                                </div>
                                <div className="space-y-3">
                                    {(teamMembers || []).map((member) => (
                                        <div key={member.id} className="flex items-center gap-4 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                                            <div className="relative">
                                                <Avatar className="w-10 h-10">
                                                    <AvatarImage src={member.avatar} />
                                                    <AvatarFallback className="bg-slate-100 text-slate-600 font-medium">
                                                        {member.name.split(" ").map(n => n[0]).join("")}
                                                    </AvatarFallback>
                                                </Avatar>
                                                <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-white ${STATUS_COLORS[member.status]}`} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900">{member.name}</p>
                                                <p className="text-xs text-slate-500 truncate">{member.currentTask}</p>
                                            </div>
                                            <Badge 
                                                variant="secondary" 
                                                className={`text-[10px] ${
                                                    member.status === "online" ? "bg-emerald-50 text-emerald-700" :
                                                    member.status === "busy" ? "bg-amber-50 text-amber-700" :
                                                    "bg-slate-100 text-slate-600"
                                                }`}
                                            >
                                                {member.status === "online" ? "Online" : member.status === "busy" ? "Busy" : "Offline"}
                                            </Badge>
                                        </div>
                                    ))}
                                    {(teamMembers || []).length === 0 && (
                                        <div className="text-center py-8">
                                            <Users className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                                            <p className="text-sm text-slate-500">No team members yet</p>
                                            <Link href={`/${slug}/staff`}>
                                                <Button variant="link" className="text-emerald-600">Invite your first team member</Button>
                                            </Link>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Needs Your Attention */}
                        <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
                            <div className="px-6 py-4 border-b border-slate-50 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <h3 className="font-semibold text-sm tracking-tight text-slate-900">
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
                                        {actions?.slice(0, 4).map((action) => {
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
                    </div>

                    {/* ── Right Column (1/3 width) ──────────────────────── */}
                    <div className="space-y-6">
                        {/* Reminders */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-semibold text-sm tracking-tight text-slate-900">Reminders</h3>
                                <Link href={`/${slug}/bookings`}>
                                    <Button variant="ghost" size="sm" className="rounded-lg text-xs text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50">
                                        View All
                                    </Button>
                                </Link>
                            </div>
                            <div className="space-y-3">
                                {(reminders || []).map((reminder) => (
                                    <div key={reminder.id} className="p-4 rounded-xl bg-slate-50 border border-slate-100">
                                        <p className="text-sm font-semibold text-slate-900">{reminder.title}</p>
                                        <div className="flex items-center gap-2 mt-2">
                                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="text-xs text-slate-500">{reminder.time}</span>
                                        </div>
                                    </div>
                                ))}
                                {(reminders || []).length === 0 && (
                                    <div className="text-center py-6">
                                        <Calendar className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                        <p className="text-xs text-slate-400">No upcoming reminders</p>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Project List */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-6">
                            <div className="flex items-center justify-between mb-5">
                                <h3 className="font-semibold text-sm tracking-tight text-slate-900">Tasks</h3>
                                <Link href={`/${slug}/bookings`}>
                                    <Button variant="outline" size="sm" className="rounded-lg gap-1 text-xs h-7">
                                        <Plus className="w-3 h-3" />
                                        New
                                    </Button>
                                </Link>
                            </div>
                            <div className="space-y-2">
                                {(projects || []).map((project) => {
                                    const Icon = PROJECT_ICONS[project.icon] || Briefcase;
                                    return (
                                        <div key={project.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors group cursor-pointer">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                                                project.status === "completed" ? "bg-emerald-50 text-emerald-600" :
                                                project.status === "in-progress" ? "bg-blue-50 text-blue-600" :
                                                "bg-amber-50 text-amber-600"
                                            }`}>
                                                <Icon className="w-5 h-5" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-slate-900 truncate">{project.name}</p>
                                                <p className="text-xs text-slate-400">Due: {project.dueDate}</p>
                                            </div>
                                            <Badge 
                                                variant="secondary" 
                                                className={`text-[10px] ${
                                                    project.status === "completed" ? "bg-emerald-50 text-emerald-700" :
                                                    project.status === "in-progress" ? "bg-blue-50 text-blue-700" :
                                                    "bg-amber-50 text-amber-700"
                                                }`}
                                            >
                                                {project.status === "completed" ? "Done" : project.status === "in-progress" ? "In Progress" : "Pending"}
                                            </Badge>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Project Progress */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-6">
                            <h3 className="font-semibold text-sm tracking-tight text-slate-900 mb-5">Task Progress</h3>
                            <div className="flex flex-col items-center">
                                <div className="relative w-40 h-40">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie
                                                data={PROJECT_STATUS_DATA}
                                                cx="50%"
                                                cy="50%"
                                                innerRadius={50}
                                                outerRadius={70}
                                                startAngle={90}
                                                endAngle={-270}
                                                dataKey="value"
                                                stroke="none"
                                            >
                                                {PROJECT_STATUS_DATA.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                                ))}
                                            </Pie>
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                                        <span className="text-3xl font-bold text-slate-900">41%</span>
                                        <span className="text-xs text-slate-400">Completed</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4 mt-4">
                                    {PROJECT_STATUS_DATA.map((item) => (
                                        <div key={item.name} className="flex items-center gap-1.5">
                                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                            <span className="text-[10px] text-slate-500">{item.name}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Time Tracker */}
                        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white overflow-hidden relative">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-1/2 -translate-x-1/2" />
                            <h3 className="font-semibold text-sm tracking-tight mb-4 relative z-10">Time Tracker</h3>
                            <div className="text-4xl font-bold tracking-tight mb-6 relative z-10">
                                {formatTime(timeTracker)}
                            </div>
                            <div className="flex items-center gap-3 relative z-10">
                                <button
                                    onClick={() => setIsTracking(!isTracking)}
                                    className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
                                        isTracking 
                                            ? "bg-white/20 hover:bg-white/30" 
                                            : "bg-white text-emerald-600 hover:bg-emerald-50"
                                    }`}
                                >
                                    {isTracking ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                                </button>
                                <button
                                    onClick={() => { setIsTracking(false); setTimeTracker(0); }}
                                    className="w-12 h-12 rounded-full bg-rose-500/20 hover:bg-rose-500/30 flex items-center justify-center transition-all"
                                >
                                    <Square className="w-5 h-5 text-rose-300" />
                                </button>
                            </div>
                        </div>

                        {/* Quick Links */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-5">
                            <h3 className="font-semibold text-sm tracking-tight text-slate-900 mb-3">Quick Links</h3>
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
                    <div className="mt-8 rounded-2xl border border-slate-100 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 overflow-hidden shadow-xl shadow-slate-300/20">
                        <div className="px-6 py-4 flex items-center justify-between border-b border-white/5">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
                                    <Sparkles className="w-4 h-4 text-amber-400" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-sm tracking-tight text-white">
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

                {/* ── Download App Banner ───────────────────────────────── */}
                <div className="mt-8 rounded-2xl bg-gradient-to-br from-emerald-900 to-slate-900 p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl" />
                    <div className="absolute bottom-0 left-0 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl" />
                    <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                                <Download className="w-7 h-7 text-emerald-400" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-white">Download CareOps Mobile</h3>
                                <p className="text-sm text-slate-400">Manage your business on the go</p>
                            </div>
                        </div>
                        <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl gap-2">
                            <Download className="w-4 h-4" />
                            Download App
                        </Button>
                    </div>
                </div>
            </main>
        </div>
    );
}
