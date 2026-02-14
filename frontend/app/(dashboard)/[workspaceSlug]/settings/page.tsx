"use client";

import { useState } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    getIntegrationStatus,
    getGmailConnectUrl,
    getGcalConnectUrl,
    disconnectIntegration,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
    Settings,
    Building2,
    Link2,
    Plug,
    Mail,
    CalendarDays,
    Send,
    ExternalLink,
    Check,
    X,
    Loader2,
    AlertTriangle,
    Users,
    ChevronRight,
    Bell,
    Shield,
    Trash2,
    Copy,
    User,
    Clock,
    MessageSquare,
} from "lucide-react";
import { toast } from "sonner";
import { useRouter, useParams } from "next/navigation";
import { WhatsAppConnect } from "@/components/features/inbox/whatsapp-connect";

/* ─── Section Nav Items ──────────────────────────────────────────────────── */

const SECTIONS = [
    { id: "workspace", label: "Workspace", icon: <Building2 className="w-4 h-4" /> },
    { id: "links", label: "Public Links", icon: <Link2 className="w-4 h-4" /> },
    { id: "integrations", label: "Integrations", icon: <Plug className="w-4 h-4" /> },
    { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
    { id: "team", label: "Team", icon: <Users className="w-4 h-4" /> },
    { id: "account", label: "Account", icon: <User className="w-4 h-4" /> },
    { id: "danger", label: "Danger Zone", icon: <AlertTriangle className="w-4 h-4" /> },
] as const;

export default function SettingsPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const queryClient = useQueryClient();
    const router = useRouter();
    const [activeSection, setActiveSection] = useState("workspace");

    // Integration status
    const { data: integrations, isLoading } = useQuery({
        queryKey: ["integration-status"],
        queryFn: getIntegrationStatus,
        refetchOnWindowFocus: true,
    });

    const gmailStatus = integrations?.gmail;
    const gcalStatus = integrations?.gcal;
    const whatsappStatus = integrations?.whatsapp;

    // Connect mutations
    const connectGmail = useMutation({
        mutationFn: async () => {
            const result = await getGmailConnectUrl();
            window.location.href = result.authorization_url;
        },
    });

    const connectGcal = useMutation({
        mutationFn: async () => {
            const result = await getGcalConnectUrl();
            window.location.href = result.authorization_url;
        },
    });

    // Disconnect mutation
    const disconnect = useMutation({
        mutationFn: (provider: string) => disconnectIntegration(provider),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["integration-status"] }),
    });

    const publicLinks = [
        {
            label: "Contact Form",
            url: `/c/${profile?.workspaceSlug}`,
            description: "Public lead capture form for new contacts",
            icon: <Mail className="w-4 h-4" />,
        },
        {
            label: "Booking Page",
            url: `/b/${profile?.workspaceSlug}`,
            description: "Public appointment scheduler for customers",
            icon: <CalendarDays className="w-4 h-4" />,
        },
    ];

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(window.location.origin + text);
        toast.success("Link copied to clipboard");
    };

    const scrollTo = (id: string) => {
        setActiveSection(id);
        document.getElementById(`section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    };

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div>
                <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                    Settings
                </h1>
                <p className="text-[13px] text-slate-400 font-medium mt-1">
                    Configure your workspace, integrations, and preferences
                </p>
            </div>

            <div className="flex gap-8">
                {/* ── Side Nav ── */}
                <nav className="w-48 shrink-0 hidden md:block sticky top-6 self-start">
                    <div className="space-y-0.5">
                        {SECTIONS.map((sec) => (
                            <button
                                key={sec.id}
                                onClick={() => scrollTo(sec.id)}
                                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium transition-colors text-left ${activeSection === sec.id
                                    ? "bg-slate-100 text-slate-900"
                                    : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                                    } ${sec.id === "danger" ? "text-rose-400 hover:text-rose-500" : ""}`}
                            >
                                {sec.icon}
                                {sec.label}
                            </button>
                        ))}
                    </div>
                </nav>

                {/* ── Main Content ── */}
                <div className="flex-1 space-y-8 min-w-0">

                    {/* ═══ 1. Workspace Details ═══ */}
                    <section id="section-workspace">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Workspace</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Your business identity and basic information
                            </p>
                        </div>
                        <Card className="rounded-2xl border-slate-100 shadow-sm">
                            <CardContent className="p-0 divide-y divide-slate-50">
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Business Name</p>
                                        <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{profile?.workspaceName || "—"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Workspace URL</p>
                                        <p className="text-[14px] font-medium text-slate-600 mt-0.5">/{profile?.workspaceSlug || "—"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Your Role</p>
                                    </div>
                                    <Badge className="rounded-full text-[10px] font-semibold px-2.5 bg-slate-900 text-white border-0 capitalize">
                                        {profile?.role || "—"}
                                    </Badge>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Logged in as</p>
                                        <p className="text-[14px] font-medium text-slate-600 mt-0.5">{profile?.email || profile?.fullName || "—"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</p>
                                    </div>
                                    <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                                    </Badge>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* ═══ 2. Public Links ═══ */}
                    <section id="section-links">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Public Links</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Share these with your customers
                            </p>
                        </div>
                        <div className="space-y-2">
                            {publicLinks.map((link) => (
                                <div
                                    key={link.label}
                                    className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-white border border-slate-100"
                                >
                                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                                        {link.icon}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-slate-900">{link.label}</p>
                                        <p className="text-[12px] text-slate-400 font-medium">{link.description}</p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-xl h-8 w-8 p-0 text-slate-400 hover:text-slate-600"
                                            onClick={() => copyToClipboard(link.url)}
                                        >
                                            <Copy className="w-3.5 h-3.5" />
                                        </Button>
                                        <a href={link.url} target="_blank" rel="noopener noreferrer">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="rounded-xl h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:text-slate-900 gap-1"
                                            >
                                                <ExternalLink className="w-3 h-3" /> Open
                                            </Button>
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>

                    {/* ═══ 3. Integrations ═══ */}
                    <section id="section-integrations">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Integrations</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Connect third-party services to your workspace
                            </p>
                        </div>
                        <div className="space-y-2">
                            {/* Gmail */}
                            <div className="flex items-center gap-4 px-4 py-4 rounded-xl bg-white border border-slate-100">
                                <div className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0">
                                    <Mail className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold text-slate-900">Gmail</p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {gmailStatus?.connected
                                            ? `Connected as ${gmailStatus.email}`
                                            : "Send and receive emails from your business inbox"}
                                    </p>
                                </div>
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                ) : gmailStatus?.connected ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                                            <Check className="w-3 h-3" /> Connected
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-xl h-8 text-[11px] font-medium text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                            onClick={() => disconnect.mutate("gmail")}
                                            disabled={disconnect.isPending}
                                        >
                                            Disconnect
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                                        onClick={() => connectGmail.mutate()}
                                        disabled={connectGmail.isPending}
                                    >
                                        {connectGmail.isPending ? (
                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
                                        ) : (
                                            "Connect"
                                        )}
                                    </Button>
                                )}
                            </div>

                            {/* Google Calendar */}
                            <div className="flex items-center gap-4 px-4 py-4 rounded-xl bg-white border border-slate-100">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-500 flex items-center justify-center shrink-0">
                                    <CalendarDays className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold text-slate-900">Google Calendar</p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {gcalStatus?.connected
                                            ? `Connected as ${gcalStatus.email}`
                                            : "Sync bookings to your calendar automatically"}
                                    </p>
                                </div>
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                ) : gcalStatus?.connected ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                                            <Check className="w-3 h-3" /> Connected
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-xl h-8 text-[11px] font-medium text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                            onClick={() => disconnect.mutate("gcal")}
                                            disabled={disconnect.isPending}
                                        >
                                            Disconnect
                                        </Button>
                                    </div>
                                ) : (
                                    <Button
                                        size="sm"
                                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                                        onClick={() => connectGcal.mutate()}
                                        disabled={connectGcal.isPending}
                                    >
                                        {connectGcal.isPending ? (
                                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Connecting...</>
                                        ) : (
                                            "Connect"
                                        )}
                                    </Button>
                                )}
                            </div>
                            {/* Telegram */}
                            <div className="flex items-center gap-4 px-4 py-4 rounded-xl bg-white border border-slate-100">
                                <div className="w-10 h-10 rounded-xl bg-sky-50 text-sky-500 flex items-center justify-center shrink-0">
                                    <Send className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold text-slate-900">Telegram Bot</p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        Alternative messaging channel for customer communication
                                    </p>
                                </div>
                                <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-amber-50 text-amber-600 border-amber-200 shrink-0">
                                    Coming Soon
                                </Badge>
                            </div>

                            {/* WhatsApp */}
                            <div className="flex items-center gap-4 px-4 py-4 rounded-xl bg-white border border-slate-100">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                                    <MessageSquare className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[14px] font-semibold text-slate-900">WhatsApp</p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {whatsappStatus?.connected
                                            ? "Account connected and ready to send/receive messages"
                                            : "Connect your account to send and receive WhatsApp messages"}
                                    </p>
                                </div>
                                {isLoading ? (
                                    <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                ) : whatsappStatus?.connected ? (
                                    <div className="flex items-center gap-2 shrink-0">
                                        <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1">
                                            <Check className="w-3 h-3" /> Connected
                                        </Badge>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="rounded-xl h-8 text-[11px] font-medium text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                            onClick={() => disconnect.mutate("whatsapp")}
                                            disabled={disconnect.isPending}
                                        >
                                            Disconnect
                                        </Button>
                                    </div>
                                ) : (
                                    <div className="shrink-0">
                                        <WhatsAppConnect onSuccess={() => queryClient.invalidateQueries({ queryKey: ["integration-status"] })} />
                                    </div>
                                )}
                            </div>
                        </div>
                    </section>

                    {/* ═══ 4. Notification Preferences ═══ */}
                    <section id="section-notifications">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Notifications</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Choose what you want to be notified about
                            </p>
                        </div>
                        <Card className="rounded-2xl border-slate-100 shadow-sm">
                            <CardContent className="p-0 divide-y divide-slate-50">
                                {[
                                    { label: "New contact submissions", description: "When someone fills out your contact form", defaultOn: true },
                                    { label: "New bookings", description: "When a customer books an appointment", defaultOn: true },
                                    { label: "No-shows", description: "When a customer misses their appointment", defaultOn: true },
                                    { label: "Overdue forms", description: "When intake forms haven't been completed", defaultOn: false },
                                    { label: "Inventory alerts", description: "When stock drops below threshold", defaultOn: true },
                                    { label: "Unanswered messages", description: "When a message hasn't been replied to", defaultOn: false },
                                ].map((item) => (
                                    <div key={item.label} className="flex items-center justify-between px-4 py-3">
                                        <div>
                                            <p className="text-[13px] font-semibold text-slate-700">{item.label}</p>
                                            <p className="text-[11px] text-slate-400 font-medium">{item.description}</p>
                                        </div>
                                        <Switch defaultChecked={item.defaultOn} className="data-[state=checked]:bg-emerald-500" />
                                    </div>
                                ))}
                            </CardContent>
                        </Card>
                        <div className="mt-3 flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-50 border border-slate-100">
                            <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                            <div className="flex-1">
                                <p className="text-[12px] font-semibold text-slate-600">Unanswered message alert after</p>
                                <p className="text-[11px] text-slate-400">How long before a message is flagged as unanswered</p>
                            </div>
                            <select className="rounded-xl h-9 border border-slate-100 bg-white px-3 text-[13px] font-medium focus:outline-none focus:border-slate-200">
                                <option value="2">2 hours</option>
                                <option value="4">4 hours</option>
                                <option value="12">12 hours</option>
                                <option value="24">24 hours</option>
                            </select>
                        </div>
                    </section>

                    {/* ═══ 5. Team Shortcut ═══ */}
                    <section id="section-team">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Team</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Manage staff members and permissions
                            </p>
                        </div>
                        <button
                            onClick={() => router.push(`/${profile?.workspaceSlug}/staff`)}
                            className="w-full flex items-center gap-4 px-4 py-4 rounded-xl bg-white border border-slate-100 hover:bg-slate-50 transition-colors group text-left"
                        >
                            <div className="w-10 h-10 rounded-xl bg-violet-50 text-violet-500 flex items-center justify-center shrink-0">
                                <Users className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-slate-900">Staff Management</p>
                                <p className="text-[12px] text-slate-400 font-medium">
                                    Invite members, set roles, and manage permissions
                                </p>
                            </div>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors shrink-0" />
                        </button>
                    </section>

                    {/* ═══ 6. Account ═══ */}
                    <section id="section-account">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-slate-900">Account</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Your personal account settings
                            </p>
                        </div>
                        <Card className="rounded-2xl border-slate-100 shadow-sm">
                            <CardContent className="p-0 divide-y divide-slate-50">
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Name</p>
                                        <p className="text-[14px] font-semibold text-slate-900 mt-0.5">{profile?.fullName || "—"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Email</p>
                                        <p className="text-[14px] font-medium text-slate-600 mt-0.5">{profile?.email || "—"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between px-4 py-3.5">
                                    <div>
                                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Password</p>
                                        <p className="text-[14px] font-medium text-slate-400 mt-0.5">••••••••</p>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="rounded-xl h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:text-slate-900"
                                    >
                                        Change Password
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    </section>

                    {/* ═══ 7. Danger Zone ═══ */}
                    <section id="section-danger">
                        <div className="mb-3">
                            <h2 className="text-[15px] font-semibold text-rose-500">Danger Zone</h2>
                            <p className="text-[12px] text-slate-400 font-medium mt-0.5">
                                Irreversible actions — proceed with caution
                            </p>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between px-4 py-4 rounded-xl border border-rose-100 bg-rose-50/30">
                                <div>
                                    <p className="text-[14px] font-semibold text-slate-900">Deactivate Workspace</p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        Take your workspace offline. Data is preserved but public links stop working.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl h-9 text-[13px] font-semibold text-rose-500 border-rose-200 hover:bg-rose-50 hover:text-rose-600 shrink-0"
                                >
                                    Deactivate
                                </Button>
                            </div>
                            <div className="flex items-center justify-between px-4 py-4 rounded-xl border border-rose-200 bg-rose-50/50">
                                <div>
                                    <p className="text-[14px] font-semibold text-rose-600">Delete Workspace</p>
                                    <p className="text-[12px] text-rose-400 font-medium">
                                        Permanently delete everything. This cannot be undone.
                                    </p>
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl h-9 text-[13px] font-semibold text-white bg-rose-500 hover:bg-rose-600 border-rose-500 shrink-0"
                                >
                                    <Trash2 className="w-3.5 h-3.5 mr-1" /> Delete
                                </Button>
                            </div>
                        </div>
                    </section>
                </div>
            </div >
        </div >
    );
}
