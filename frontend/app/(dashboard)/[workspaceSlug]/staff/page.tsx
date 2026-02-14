"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspaceStore, type Permissions } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import api from "@/lib/api";
import {
    Loader2,
    UserPlus,
    Shield,
    Users,
    Trash2,
    Pencil,
    X,
    Check,
    Mail,
    Clock,
    Inbox,
    CalendarDays,
    FileText,
    Package,
    BarChart3,
    Search,
    UserX,
    UserCheck,
    ChevronRight,
    MoreHorizontal,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface StaffMember {
    id: string;
    full_name: string;
    email?: string;
    role: string;
    avatar_url?: string;
    phone?: string;
    permissions?: Permissions;
    created_at: string;
}

interface Invitation {
    id: string;
    email: string;
    full_name: string;
    status: string;
    permissions?: Permissions;
    created_at: string;
}

const PERMISSION_OPTIONS: {
    key: keyof Permissions;
    label: string;
    description: string;
    icon: React.ReactNode;
}[] = [
        {
            key: "inbox",
            label: "Inbox",
            description: "Read and reply to messages",
            icon: <Inbox className="w-4 h-4" />,
        },
        {
            key: "bookings",
            label: "Bookings",
            description: "View and manage appointments",
            icon: <CalendarDays className="w-4 h-4" />,
        },
        {
            key: "forms",
            label: "Forms",
            description: "View form submissions",
            icon: <FileText className="w-4 h-4" />,
        },
        {
            key: "inventory",
            label: "Inventory",
            description: "View and manage stock levels",
            icon: <Package className="w-4 h-4" />,
        },
        {
            key: "reports",
            label: "Reports",
            description: "View analytics and dashboards",
            icon: <BarChart3 className="w-4 h-4" />,
        },
    ];

const DEFAULT_PERMS: Permissions = {
    inbox: false,
    bookings: false,
    forms: false,
    inventory: false,
    reports: false,
};

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "Just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

function getInitials(name: string) {
    return name
        .split(" ")
        .map((w) => w.charAt(0))
        .slice(0, 2)
        .join("")
        .toUpperCase();
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function StaffPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const [staff, setStaff] = useState<StaffMember[]>([]);
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);

    // Invite dialog state
    const [showInvite, setShowInvite] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [invitePerms, setInvitePerms] = useState<Permissions>({ ...DEFAULT_PERMS });
    const [inviting, setInviting] = useState(false);

    // Edit permissions dialog
    const [editingMember, setEditingMember] = useState<StaffMember | null>(null);
    const [editPerms, setEditPerms] = useState<Permissions>({ ...DEFAULT_PERMS });
    const [saving, setSaving] = useState(false);

    // Search
    const [searchQuery, setSearchQuery] = useState("");

    const isOwner = profile?.role === "owner";

    const fetchStaff = useCallback(async () => {
        if (!profile) return;
        setLoading(true);
        try {
            const { data } = await api.get("/api/v1/staff");
            setStaff(data || []);
        } catch (err) {
            console.error("Failed to fetch staff:", err);
            setStaff([]);
        } finally {
            setLoading(false);
        }
    }, [profile]);

    const fetchInvitations = useCallback(async () => {
        if (!profile || !isOwner) return;
        try {
            const { data } = await api.get("/api/v1/staff/invitations");
            setInvitations(data || []);
        } catch {
            setInvitations([]);
        }
    }, [profile, isOwner]);

    useEffect(() => {
        fetchStaff();
        fetchInvitations();
    }, [fetchStaff, fetchInvitations]);

    const handleInvite = async () => {
        if (!inviteEmail || !inviteName) return;
        setInviting(true);
        try {
            const { data } = await api.post("/api/v1/staff/invite", {
                email: inviteEmail,
                full_name: inviteName,
                permissions: invitePerms,
            });
            if (data.email_sent) {
                toast.success(`Credentials sent to ${inviteEmail}`);
            } else {
                toast.success(`Account created. Password: ${data.password}`, {
                    duration: 15000,
                });
            }
            setInviteEmail("");
            setInviteName("");
            setInvitePerms({ ...DEFAULT_PERMS });
            setShowInvite(false);
            fetchStaff();
            fetchInvitations();
        } catch (err: any) {
            const msg = err?.response?.data?.detail || "Failed to invite staff member";
            toast.error(msg);
        } finally {
            setInviting(false);
        }
    };

    const handleRemove = async (staffId: string, name: string) => {
        if (!confirm(`Remove ${name} from the workspace? This will delete their account.`)) return;
        try {
            await api.delete(`/api/v1/staff/${staffId}`);
            toast.success(`${name} removed`);
            fetchStaff();
        } catch (err) {
            console.error("Failed to remove:", err);
            toast.error("Failed to remove staff member");
        }
    };

    const openEditPermissions = (member: StaffMember) => {
        setEditingMember(member);
        setEditPerms(member.permissions || { ...DEFAULT_PERMS });
    };

    const savePermissions = async () => {
        if (!editingMember) return;
        setSaving(true);
        try {
            await api.patch(`/api/v1/staff/${editingMember.id}/permissions`, {
                permissions: editPerms,
            });
            toast.success(`Permissions updated for ${editingMember.full_name}`);
            setEditingMember(null);
            fetchStaff();
        } catch (err) {
            console.error("Failed to update permissions:", err);
            toast.error("Failed to update permissions");
        } finally {
            setSaving(false);
        }
    };

    // Separate owners and staff
    const owners = staff.filter((m) => m.role === "owner");
    const staffMembers = staff.filter((m) => m.role === "staff");
    const pendingInvites = invitations.filter((i) => i.status === "pending");
    const acceptedInvites = invitations.filter((i) => i.status === "accepted");

    // Filter staff by search
    const filteredStaff = staffMembers.filter((m) => {
        if (!searchQuery) return true;
        const q = searchQuery.toLowerCase();
        return (
            m.full_name.toLowerCase().includes(q) ||
            (m.email || "").toLowerCase().includes(q)
        );
    });

    const activePermCount = (perms?: Permissions) =>
        perms ? Object.values(perms).filter(Boolean).length : 0;

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Team
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Manage your staff, roles, and permissions
                    </p>
                </div>
                {isOwner && (
                    <Button
                        onClick={() => setShowInvite(true)}
                        size="sm"
                        className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                    >
                        <UserPlus className="w-3.5 h-3.5" /> Invite Member
                    </Button>
                )}
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl bg-slate-900 text-white p-5 shadow-lg shadow-slate-900/10">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active Members</span>
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                            <Users className="w-4 h-4 text-emerald-400" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-white">{staffMembers.length}</span>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Pending Invites</span>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <Mail className="w-4 h-4 text-amber-500" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{pendingInvites.length}</span>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Owners</span>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <Shield className="w-4 h-4 text-emerald-500" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{owners.length}</span>
                </div>
            </div>

            {/* ── Owner Card ── */}
            {owners.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Workspace Owner
                    </p>
                    {owners.map((owner) => (
                        <div
                            key={owner.id}
                            className="flex items-center gap-4 px-4 py-3.5 rounded-xl bg-gradient-to-r from-slate-50 to-white border border-slate-100"
                        >
                            <div className="w-10 h-10 rounded-xl bg-slate-900 text-white flex items-center justify-center text-[13px] font-bold shrink-0">
                                {getInitials(owner.full_name || "?")}
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[14px] font-semibold text-slate-900">
                                    {owner.full_name || "Unknown"}
                                </p>
                                <p className="text-[12px] text-slate-400 font-medium">
                                    {owner.email || "No email"} · Full access
                                </p>
                            </div>
                            <Badge className="rounded-full text-[10px] font-semibold px-2.5 bg-slate-900 text-white border-0 gap-1">
                                <Shield className="w-3 h-3" /> Owner
                            </Badge>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Active Staff Section ── */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                        Staff Members ({staffMembers.length})
                    </p>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl h-7 text-[11px] font-medium text-slate-400 hover:text-slate-600 gap-1"
                        onClick={() => { fetchStaff(); fetchInvitations(); }}
                    >
                        <Clock className="w-3 h-3" /> Refresh
                    </Button>
                </div>

                {/* Search */}
                {staffMembers.length > 0 && (
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="rounded-xl h-10 pl-9 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                        />
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-16 gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                        <span className="text-[13px] text-slate-300 font-medium">Loading team...</span>
                    </div>
                ) : filteredStaff.length === 0 && staffMembers.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                        <Users className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                        <p className="text-[15px] font-semibold text-slate-400">
                            No team members yet
                        </p>
                        <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                            Invite your first team member to start collaborating.
                        </p>
                        {isOwner && (
                            <Button
                                onClick={() => setShowInvite(true)}
                                size="sm"
                                className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 mt-4"
                            >
                                <UserPlus className="w-3.5 h-3.5" /> Invite Member
                            </Button>
                        )}
                    </div>
                ) : filteredStaff.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-8 text-center">
                        <Search className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                        <p className="text-[13px] text-slate-400 font-medium">
                            No members match &quot;{searchQuery}&quot;
                        </p>
                    </div>
                ) : (
                    <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                        <CardContent className="p-0 divide-y divide-slate-50">
                            {filteredStaff.map((member) => {
                                const permCount = activePermCount(member.permissions);
                                return (
                                    <div
                                        key={member.id}
                                        className="flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50/50 transition-colors group"
                                    >
                                        {/* Avatar */}
                                        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-[13px] font-bold shrink-0">
                                            {getInitials(member.full_name || "?")}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[14px] font-semibold text-slate-900">
                                                {member.full_name || "Unknown"}
                                            </p>
                                            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                <span className="text-[12px] text-slate-400 font-medium">
                                                    {member.email || "No email"}
                                                </span>
                                                <span className="text-slate-200">·</span>
                                                <span className="text-[11px] text-slate-400 font-medium">
                                                    Joined {new Date(member.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                                </span>
                                            </div>
                                            {/* Permission badges */}
                                            <div className="flex flex-wrap gap-1 mt-2">
                                                {member.permissions &&
                                                    PERMISSION_OPTIONS.map((opt) =>
                                                        member.permissions![opt.key] ? (
                                                            <Badge
                                                                key={opt.key}
                                                                variant="outline"
                                                                className="rounded-full text-[10px] font-semibold px-2 py-0 h-5 bg-emerald-50 text-emerald-600 border-emerald-200 gap-1"
                                                            >
                                                                {opt.icon}
                                                                {opt.label}
                                                            </Badge>
                                                        ) : null
                                                    )}
                                                {permCount === 0 && (
                                                    <Badge
                                                        variant="outline"
                                                        className="rounded-full text-[10px] font-semibold px-2 py-0 h-5 bg-slate-50 text-slate-400 border-slate-200"
                                                    >
                                                        No permissions
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        {isOwner && (
                                            <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => openEditPermissions(member)}
                                                    className="rounded-xl h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:text-slate-900 gap-1"
                                                >
                                                    <Pencil className="w-3 h-3" /> Edit
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => handleRemove(member.id, member.full_name)}
                                                    className="rounded-xl h-8 w-8 p-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* ── Pending Invitations ── */}
            {isOwner && pendingInvites.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Pending Invitations ({pendingInvites.length})
                    </p>
                    <div className="space-y-2">
                        {pendingInvites.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-amber-50/50 border border-amber-100"
                            >
                                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                                    <Mail className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-900">
                                        {inv.full_name}
                                    </p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {inv.email} · Sent {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className="rounded-full text-[10px] font-semibold px-2.5 bg-amber-50 text-amber-600 border-amber-200 shrink-0"
                                >
                                    <Clock className="w-3 h-3 mr-1" /> Pending
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Accepted Invitations ── */}
            {isOwner && acceptedInvites.length > 0 && (
                <div>
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                        Accepted Invitations ({acceptedInvites.length})
                    </p>
                    <div className="space-y-2">
                        {acceptedInvites.map((inv) => (
                            <div
                                key={inv.id}
                                className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white border border-slate-100"
                            >
                                <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-500 flex items-center justify-center shrink-0">
                                    <UserCheck className="w-4 h-4" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[13px] font-semibold text-slate-900">
                                        {inv.full_name}
                                    </p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {inv.email} · Joined {new Date(inv.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                    </p>
                                </div>
                                <Badge
                                    variant="outline"
                                    className="rounded-full text-[10px] font-semibold px-2.5 bg-emerald-50 text-emerald-600 border-emerald-200 shrink-0"
                                >
                                    <Check className="w-3 h-3 mr-1" /> Accepted
                                </Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ── Invite Dialog ── */}
            <Dialog open={showInvite} onOpenChange={setShowInvite}>
                <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                            Invite Team Member
                        </DialogTitle>
                        <p className="text-[13px] text-slate-400 font-medium mt-0.5">
                            They&apos;ll receive login credentials via email
                        </p>
                    </DialogHeader>

                    <div className="space-y-4 mt-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Full Name <span className="text-rose-400">*</span>
                                </Label>
                                <Input
                                    value={inviteName}
                                    onChange={(e) => setInviteName(e.target.value)}
                                    placeholder="Sarah Johnson"
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                    Email <span className="text-rose-400">*</span>
                                </Label>
                                <Input
                                    type="email"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    placeholder="sarah@company.com"
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                />
                            </div>
                        </div>

                        {/* Permissions */}
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Permissions
                            </Label>
                            <p className="text-[11px] text-slate-400 font-medium -mt-1">
                                Select what this person can access. Nothing is enabled by default.
                            </p>
                            <div className="space-y-1.5">
                                {PERMISSION_OPTIONS.map((opt) => (
                                    <label
                                        key={opt.key}
                                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${invitePerms[opt.key]
                                            ? "bg-emerald-50 border-emerald-200"
                                            : "bg-white border-slate-100 hover:bg-slate-50"
                                            }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${invitePerms[opt.key]
                                            ? "bg-emerald-100 text-emerald-600"
                                            : "bg-slate-100 text-slate-400"
                                            }`}>
                                            {opt.icon}
                                        </div>
                                        <div className="flex-1">
                                            <p className="text-[13px] font-semibold text-slate-700">{opt.label}</p>
                                            <p className="text-[11px] text-slate-400">{opt.description}</p>
                                        </div>
                                        <Switch
                                            checked={invitePerms[opt.key]}
                                            onCheckedChange={(checked) =>
                                                setInvitePerms((prev) => ({ ...prev, [opt.key]: !!checked }))
                                            }
                                        />
                                    </label>
                                ))}
                            </div>
                        </div>
                    </div>

                    <DialogFooter className="gap-2 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500"
                            onClick={() => setShowInvite(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleInvite}
                            disabled={!inviteEmail || !inviteName || inviting}
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                        >
                            {inviting ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending...</>
                            ) : (
                                <><UserPlus className="w-3.5 h-3.5" /> Send Invite</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Edit Permissions Dialog ── */}
            <Dialog open={!!editingMember} onOpenChange={(o) => !o && setEditingMember(null)}>
                <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                            Edit Permissions
                        </DialogTitle>
                        {editingMember && (
                            <div className="flex items-center gap-3 mt-2">
                                <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-[12px] font-bold shrink-0">
                                    {getInitials(editingMember.full_name || "?")}
                                </div>
                                <div>
                                    <p className="text-[13px] font-semibold text-slate-900">
                                        {editingMember.full_name}
                                    </p>
                                    <p className="text-[12px] text-slate-400 font-medium">
                                        {editingMember.email || "No email"} · Staff
                                    </p>
                                </div>
                            </div>
                        )}
                    </DialogHeader>

                    <div className="space-y-1.5 mt-2">
                        {PERMISSION_OPTIONS.map((opt) => (
                            <label
                                key={opt.key}
                                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-all ${editPerms[opt.key]
                                    ? "bg-emerald-50 border-emerald-200"
                                    : "bg-white border-slate-100 hover:bg-slate-50"
                                    }`}
                            >
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${editPerms[opt.key]
                                    ? "bg-emerald-100 text-emerald-600"
                                    : "bg-slate-100 text-slate-400"
                                    }`}>
                                    {opt.icon}
                                </div>
                                <div className="flex-1">
                                    <p className="text-[13px] font-semibold text-slate-700">{opt.label}</p>
                                    <p className="text-[11px] text-slate-400">{opt.description}</p>
                                </div>
                                <Switch
                                    checked={editPerms[opt.key]}
                                    onCheckedChange={(checked) =>
                                        setEditPerms((prev) => ({ ...prev, [opt.key]: !!checked }))
                                    }
                                />
                            </label>
                        ))}
                    </div>

                    <DialogFooter className="gap-2 mt-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500"
                            onClick={() => setEditingMember(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={savePermissions}
                            disabled={saving}
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                        >
                            {saving ? (
                                <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                            ) : (
                                <><Check className="w-3.5 h-3.5" /> Save Changes</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
