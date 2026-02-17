"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useWorkspaceStore, type Permissions } from "@/stores/workspace-store";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    LayoutDashboard, Inbox, CalendarDays, ClipboardList,
    Package, Users, Zap, Settings, LogOut, ChevronDown,
    Bell, CheckCircle2, XCircle, AlertTriangle, X, Loader2, UserPlus,
} from "lucide-react";
import api from "@/lib/api";
import { WakeupGate } from "@/components/auth/wakeup-screen";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface NotificationItem {
    id: string;
    type: "automation" | "alert";
    title: string;
    detail: string;
    status: "success" | "error" | "warning";
    time: string;
    isRead?: boolean;
    isResolved?: boolean;
}

/* ─── Time Ago Helper ────────────────────────────────────────────────────── */

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Navigation items with role/permission requirements */
const NAV_ITEMS = [
    { label: "Dashboard", href: "", icon: LayoutDashboard, ownerOnly: false, permKey: "reports" as keyof Permissions },
    { label: "Inbox", href: "/inbox", icon: Inbox, ownerOnly: false, permKey: "inbox" as keyof Permissions },
    { label: "Leads", href: "/leads", icon: UserPlus, ownerOnly: false, permKey: "inbox" as keyof Permissions },
    { label: "Bookings", href: "/bookings", icon: CalendarDays, ownerOnly: false, permKey: "bookings" as keyof Permissions },
    { label: "Forms", href: "/forms", icon: ClipboardList, ownerOnly: false, permKey: "forms" as keyof Permissions },
    { label: "Inventory", href: "/inventory", icon: Package, ownerOnly: false, permKey: "inventory" as keyof Permissions },
    { label: "Staff", href: "/staff", icon: Users, ownerOnly: true, permKey: null },
    { label: "Automation", href: "/automation", icon: Zap, ownerOnly: true, permKey: null },
    { label: "Settings", href: "/settings", icon: Settings, ownerOnly: true, permKey: null },
] as const;

const DEFAULT_PERMISSIONS: Permissions = {
    inbox: true,
    leads: true,
    bookings: true,
    forms: true,
    inventory: false,
    reports: false,
};

function DashboardContent({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();
    const router = useRouter();
    const profile = useWorkspaceStore((s) => s.profile);
    const setProfile = useWorkspaceStore((s) => s.setProfile);
    const clearProfile = useWorkspaceStore((s) => s.clearProfile);
    const hasPermission = useWorkspaceStore((s) => s.hasPermission);

    // Notification state
    const [showNotifications, setShowNotifications] = useState(false);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [notificationsLoading, setNotificationsLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);
    const notifRef = useRef<HTMLDivElement>(null);

    // Extract slug from pathname as a fallback
    const slug = profile?.workspaceSlug ?? pathname.split("/")[1] ?? "";

    const isOwner = profile?.role === "owner";

    // Fetch profile from Supabase if store is empty (e.g. after page refresh)
    useEffect(() => {
        if (profile) return;

        async function loadProfile() {
            const supabase = createClient();
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                router.push("/login");
                return;
            }

            const { data: p } = await supabase
                .from("profiles")
                .select("id, workspace_id, role, full_name, avatar_url, permissions, workspaces(id, name, slug, settings)")
                .eq("id", user.id)
                .single();

            if (p?.workspaces) {
                const ws = p.workspaces as any;
                const workspace = Array.isArray(ws) ? ws[0] : ws;
                if (workspace) {
                    setProfile({
                        id: p.id,
                        workspaceId: workspace.id,
                        workspaceName: workspace.name,
                        workspaceSlug: workspace.slug,
                        role: p.role,
                        fullName: p.full_name,
                        avatarUrl: p.avatar_url,
                        email: user.email ?? null,
                        permissions: (p as any).permissions ?? DEFAULT_PERMISSIONS,
                    });

                    if (p.role === "owner" && !workspace.settings?.onboarded) {
                        router.push("/onboarding");
                        return;
                    }
                }
            }
        }

        loadProfile();
    }, [profile, setProfile, router]);

    // Fetch notifications (automation logs + inventory alerts)
    const fetchNotifications = useCallback(async () => {
        setNotificationsLoading(true);
        const items: NotificationItem[] = [];

        try {
            // Fetch automation logs
            const { data: logs } = await api.get("/api/v1/automation/logs");
            if (logs && Array.isArray(logs)) {
                logs.slice(0, 15).forEach((log: any) => {
                    const isFailed = log.status === "error" || log.status === "failed";
                    items.push({
                        id: `log-${log.id}`,
                        type: "automation",
                        title: log.automation_rules?.name || "Automation",
                        detail: log.trigger_payload?.contact_name
                            ? `To ${log.trigger_payload.contact_name}`
                            : isFailed ? "Action failed" : "Completed successfully",
                        status: isFailed ? "error" : "success",
                        time: log.created_at || "",
                        isResolved: false, // Automation logs aren't "resolvable" in the same way
                    });
                });
            }
        } catch { /* silently fail */ }

        try {
            // Fetch inventory alerts
            const { data: alerts } = await api.get("/api/v1/inventory/alerts");
            if (alerts && Array.isArray(alerts)) {
                alerts.slice(0, 10).forEach((alert: any) => {
                    items.push({
                        id: `alert-${alert.id}`,
                        type: "alert",
                        title: alert.item_name || "Inventory Alert",
                        detail: alert.alert_type === "out_of_stock"
                            ? "Out of stock"
                            : `Low stock — ${alert.current_quantity ?? 0} remaining`,
                        status: alert.alert_type === "out_of_stock" ? "error" : "warning",
                        time: alert.created_at || "",
                        isResolved: alert.resolved || false,
                    });
                });
            }
        } catch { /* silently fail */ }

        // Sort by time, newest first
        items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
        setNotifications(items);

        // Calculate unread count based on last seen time and resolution status
        const lastSeenStr = localStorage.getItem("careops_notifications_seen_at");
        const lastSeen = lastSeenStr ? new Date(lastSeenStr).getTime() : 0;

        const count = items.filter((n) => {
            const isCritical = n.status === "error" || n.status === "warning";
            const isNew = new Date(n.time).getTime() > lastSeen;
            const isUnresolved = !n.isResolved;
            return isCritical && isNew && isUnresolved;
        }).length;

        setUnreadCount(count);
        setNotificationsLoading(false);
    }, []);

    // Fetch notifications on mount
    useEffect(() => {
        if (profile) {
            fetchNotifications();
            // Poll every 60 seconds
            const interval = setInterval(fetchNotifications, 60000);
            return () => clearInterval(interval);
        }
    }, [profile, fetchNotifications]);

    // Close notification panel on outside click
    useEffect(() => {
        function handleClickOutside(e: MouseEvent) {
            if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
                setShowNotifications(false);
            }
        }
        if (showNotifications) {
            document.addEventListener("mousedown", handleClickOutside);
            return () => document.removeEventListener("mousedown", handleClickOutside);
        }
    }, [showNotifications]);

    async function handleLogout() {
        const supabase = createClient();
        await supabase.auth.signOut();
        clearProfile();
        router.push("/login");
    }

    // Filter nav items based on role and permissions
    const visibleNavItems = NAV_ITEMS.filter((item) => {
        if (isOwner) return true;
        if (item.ownerOnly) return false;
        if (item.permKey === null) return true;
        return hasPermission(item.permKey);
    });

    const initials =
        profile?.fullName
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase() ?? "?";

    const statusIcon = (status: string) => {
        if (status === "success") return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
        if (status === "error") return <XCircle className="w-4 h-4 text-rose-500" />;
        return <AlertTriangle className="w-4 h-4 text-amber-500" />;
    };

    const statusBg = (status: string) => {
        if (status === "success") return "bg-emerald-50";
        if (status === "error") return "bg-rose-50";
        return "bg-amber-50";
    };

    return (
        <div className="flex h-screen overflow-hidden bg-white text-slate-900 font-sans selection:bg-slate-900 selection:text-white">
            {/* ── Sidebar ────────────────────────────────────────────────── */}
            <aside className="w-[260px] border-r border-slate-100 bg-slate-50/40 flex flex-col">
                {/* Workspace header */}
                <div className="px-6 pt-8 pb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shadow-lg shadow-slate-200">
                            <span className="text-white font-display font-bold text-base tracking-tighter">C</span>
                        </div>
                        <div className="overflow-hidden flex-1">
                            <h2 className="font-display font-bold text-base tracking-tight text-slate-900 truncate leading-none">
                                {profile?.workspaceName ?? "CareOps"}
                            </h2>
                            <span className="text-[10px] font-bold text-slate-400 tracking-tight capitalize">
                                {profile?.role ?? "Workspace"}
                            </span>
                        </div>
                        {/* Notification bell */}
                        <div className="relative" ref={notifRef}>
                            <button
                                onClick={() => {
                                    const nextShow = !showNotifications;
                                    setShowNotifications(nextShow);
                                    if (nextShow) {
                                        fetchNotifications();
                                        // Mark all as seen
                                        localStorage.setItem("careops_notifications_seen_at", new Date().toISOString());
                                        setUnreadCount(0);
                                    }
                                }}
                                className={`relative w-8 h-8 rounded-xl flex items-center justify-center transition-colors ${showNotifications ? "bg-slate-200 text-slate-900" : "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                                    }`}
                            >
                                <Bell className="w-4 h-4" />
                                {unreadCount > 0 && (
                                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-rose-500 text-[9px] font-bold text-white flex items-center justify-center">
                                        {unreadCount > 9 ? "9+" : unreadCount}
                                    </span>
                                )}
                            </button>

                            {/* Notification Panel */}
                            {showNotifications && (
                                <div className="absolute top-10 left-0 w-80 bg-white rounded-2xl border border-slate-100 shadow-2xl shadow-slate-200/50 z-50 overflow-hidden animate-in slide-in-from-top-2 duration-200">
                                    {/* Panel header */}
                                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50">
                                        <h3 className="text-[13px] font-semibold text-slate-900">Notifications</h3>
                                        <button
                                            onClick={() => setShowNotifications(false)}
                                            className="w-6 h-6 rounded-lg flex items-center justify-center text-slate-300 hover:text-slate-500 hover:bg-slate-50 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </div>

                                    {/* Panel body */}
                                    <div className="max-h-[360px] overflow-y-auto">
                                        {notificationsLoading ? (
                                            <div className="flex items-center justify-center py-10 gap-2">
                                                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                                <span className="text-[12px] text-slate-300 font-medium">Loading...</span>
                                            </div>
                                        ) : notifications.length === 0 ? (
                                            <div className="py-10 text-center">
                                                <Bell className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                                                <p className="text-[13px] text-slate-400 font-medium">No notifications yet</p>
                                                <p className="text-[11px] text-slate-300 mt-0.5">Activity will appear here</p>
                                            </div>
                                        ) : (
                                            notifications.slice(0, 20).map((notif) => (
                                                <div
                                                    key={notif.id}
                                                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50/50 transition-colors border-b border-slate-50 last:border-0"
                                                >
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${statusBg(notif.status)}`}>
                                                        {statusIcon(notif.status)}
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[12px] font-semibold text-slate-900 truncate">{notif.title}</p>
                                                            {notif.isResolved && (
                                                                <Badge variant="outline" className="h-4 px-1 text-[8px] uppercase tracking-wider bg-slate-50 text-slate-400 border-slate-100">
                                                                    Resolved
                                                                </Badge>
                                                            )}
                                                        </div>
                                                        <p className="text-[11px] text-slate-400 truncate">{notif.detail}</p>
                                                    </div>
                                                    <span className="text-[10px] text-slate-300 font-medium shrink-0 mt-0.5">
                                                        {notif.time ? timeAgo(notif.time) : ""}
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Nav links */}
                <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
                    <p className="px-4 pt-2 pb-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-300">Menu</p>
                    {visibleNavItems.map((item) => {
                        const href = `/${slug}${item.href}`;
                        const isActive =
                            item.href === ""
                                ? pathname === `/${slug}`
                                : pathname.startsWith(href);
                        const Icon = item.icon;

                        return (
                            <Link key={item.label} href={href}>
                                <div className={`
                                    group flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 relative
                                    ${isActive
                                        ? "bg-white text-slate-900 shadow-sm border border-slate-100"
                                        : "text-slate-500 hover:text-slate-900 hover:bg-white/60"
                                    }
                                `}>
                                    <Icon className={`w-[18px] h-[18px] shrink-0 transition-colors ${isActive ? "text-slate-900" : "text-slate-400 group-hover:text-slate-600"}`} />
                                    <span className={`text-[13px] tracking-tight transition-colors ${isActive ? "font-bold" : "font-medium"}`}>
                                        {item.label}
                                    </span>
                                    {isActive && (
                                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 bg-slate-900 rounded-r-full" />
                                    )}
                                </div>
                            </Link>
                        );
                    })}
                </nav>

                {/* User menu */}
                <div className="p-3 border-t border-slate-100">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white transition-all group text-left">
                                <Avatar className="h-9 w-9 rounded-xl border border-slate-100 shrink-0">
                                    <AvatarFallback className="text-[10px] font-bold uppercase tracking-wider bg-slate-900 text-white rounded-xl">
                                        {initials}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1 overflow-hidden min-w-0">
                                    <p className="font-semibold text-[13px] text-slate-900 truncate tracking-tight leading-none">
                                        {profile?.fullName ?? profile?.email?.split('@')[0] ?? "User"}
                                    </p>
                                    <p className="text-[11px] text-slate-400 truncate tracking-tight mt-0.5">
                                        {profile?.email ?? ""}
                                    </p>
                                </div>
                                <ChevronDown className="w-3.5 h-3.5 text-slate-300 shrink-0 group-hover:text-slate-500 transition-colors" />
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56 rounded-xl p-1.5 border-slate-100 shadow-xl shadow-slate-200/50">
                            <DropdownMenuItem
                                onClick={handleLogout}
                                className="rounded-lg px-3 py-2.5 text-rose-600 font-semibold text-xs cursor-pointer hover:bg-rose-50 focus:bg-rose-50 transition-colors flex items-center gap-2"
                            >
                                <LogOut className="w-3.5 h-3.5" />
                                Sign Out
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </aside>

            {/* ── Main content ──────────────────────────────────────────── */}
            <main className="flex-1 overflow-y-auto bg-white">
                <div className="p-8 md:p-10 max-w-[1400px] mx-auto w-full">{children}</div>
            </main>
        </div>
    );
}

export default function DashboardLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ workspaceSlug: string }>;
}) {
    return (
        <WakeupGate>
            <DashboardContent>
                {children}
            </DashboardContent>
        </WakeupGate>
    );
}
