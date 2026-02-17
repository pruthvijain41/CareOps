"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import {
    listLeads,
    createLead,
    updateLeadStatus,
    updateLeadNotes,
    getLeadMetrics,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
    Search,
    Plus,
    Loader2,
    UserPlus,
    TrendingUp,
    Users,
    Sparkles,
    XCircle,
    ChevronDown,
    StickyNote,
    MessageSquare,
    Mail,
    Phone,
    Filter,
    ArrowUpRight,
    RefreshCw,
} from "lucide-react";

/* ────────────────────────── Types ────────────────────────── */

interface Lead {
    id: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    lead_status: string;
    lead_source: string;
    lead_notes: string | null;
    last_contacted_at: string | null;
    created_at: string;
    conversations?: { id: string; last_message_at: string; channel: string }[];
    bookings?: { id: string; status: string; starts_at: string }[];
}

interface Metrics {
    total: number;
    new: number;
    contacted: number;
    in_progress: number;
    qualified: number;
    booking_sent: number;
    converted: number;
    lost: number;
    conversion_rate: number;
}

/* ────────────────────────── Constants ────────────────────────── */

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; dot: string }> = {
    new: { label: "New", color: "text-blue-600", bg: "bg-blue-50 border-blue-100", dot: "bg-blue-500" },
    contacted: { label: "Contacted", color: "text-sky-600", bg: "bg-sky-50 border-sky-100", dot: "bg-sky-500" },
    in_progress: { label: "In Progress", color: "text-amber-600", bg: "bg-amber-50 border-amber-100", dot: "bg-amber-500" },
    qualified: { label: "Qualified", color: "text-violet-600", bg: "bg-violet-50 border-violet-100", dot: "bg-violet-500" },
    booking_sent: { label: "Booking Sent", color: "text-teal-600", bg: "bg-teal-50 border-teal-100", dot: "bg-teal-500" },
    converted: { label: "Converted", color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100", dot: "bg-emerald-500" },
    lost: { label: "Lost", color: "text-rose-600", bg: "bg-rose-50 border-rose-100", dot: "bg-rose-500" },
};

const SOURCE_LABELS: Record<string, string> = {
    contact_form: "Contact Form",
    gmail: "Gmail",
    telegram: "Telegram",
    whatsapp: "WhatsApp",
    manual: "Manual",
    unknown: "Unknown",
};

const ALL_STATUSES = Object.keys(STATUS_CONFIG);
const ALL_SOURCES = Object.keys(SOURCE_LABELS);

/* ────────────────────────── Helpers ────────────────────────── */

function timeAgo(iso: string | null): string {
    if (!iso) return "—";
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

function formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/* ────────────────────────── Components ────────────────────────── */

function MetricCard({ label, value, icon: Icon, accent }: {
    label: string;
    value: number | string;
    icon: React.ElementType;
    accent: string;
}) {
    return (
        <div className="flex items-center gap-4 p-4 bg-white rounded-2xl border border-slate-100 hover:shadow-sm transition-shadow">
            <div className={`w-10 h-10 rounded-xl ${accent} flex items-center justify-center shrink-0`}>
                <Icon className="w-4.5 h-4.5 text-white" />
            </div>
            <div>
                <p className="text-xl font-bold text-slate-900 tracking-tight">{value}</p>
                <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">{label}</p>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.new;
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${cfg.bg} ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function SourceBadge({ source }: { source: string }) {
    return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-500 border border-slate-100">
            {SOURCE_LABELS[source] || source}
        </span>
    );
}

/* ────────────────────────── Status Dropdown ────────────────────────── */

function StatusDropdown({ currentStatus, onSelect }: {
    currentStatus: string;
    onSelect: (s: string) => void;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen(!open)}
                className="flex items-center gap-1 hover:opacity-80 transition-opacity"
            >
                <StatusBadge status={currentStatus} />
                <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-44 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                        {ALL_STATUSES.map((s) => {
                            const cfg = STATUS_CONFIG[s];
                            return (
                                <button
                                    key={s}
                                    onClick={() => { onSelect(s); setOpen(false); }}
                                    className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 transition-colors ${s === currentStatus ? "bg-slate-50" : ""}`}
                                >
                                    <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                                    <span className={`font-medium ${cfg.color}`}>{cfg.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
}

/* ────────────────────────── Notes Modal ────────────────────────── */

function NotesModal({ lead, open, onClose, onSave }: {
    lead: Lead | null;
    open: boolean;
    onClose: () => void;
    onSave: (id: string, notes: string) => void;
}) {
    const [text, setText] = useState("");

    useEffect(() => {
        if (lead) setText(lead.lead_notes || "");
    }, [lead]);

    if (!lead) return null;
    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[440px] rounded-2xl border-slate-100 bg-white p-6">
                <DialogHeader>
                    <DialogTitle className="font-display text-lg text-slate-900">Notes — {lead.full_name}</DialogTitle>
                </DialogHeader>
                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Add notes about this lead..."
                    rows={5}
                    className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-[13px] text-slate-700 placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 resize-none"
                />
                <div className="flex justify-end gap-2 mt-2">
                    <Button variant="ghost" onClick={onClose} className="rounded-xl h-9 text-[13px] font-medium text-slate-400">Cancel</Button>
                    <Button
                        onClick={() => onSave(lead.id, text)}
                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                    >
                        Save Notes
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ────────────────────────── Add Lead Modal ────────────────────────── */

function AddLeadModal({ open, onClose, onCreated }: {
    open: boolean;
    onClose: () => void;
    onCreated: () => void;
}) {
    const [form, setForm] = useState({ full_name: "", email: "", phone: "", lead_source: "manual", lead_notes: "" });
    const [saving, setSaving] = useState(false);

    const handleSubmit = async () => {
        if (!form.full_name.trim()) { toast.error("Name is required"); return; }
        setSaving(true);
        try {
            await createLead(form);
            toast.success("Lead created");
            setForm({ full_name: "", email: "", phone: "", lead_source: "manual", lead_notes: "" });
            onCreated();
            onClose();
        } catch {
            toast.error("Failed to create lead");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-100 bg-white p-0 overflow-hidden">
                <div className="p-6 space-y-5">
                    <DialogHeader>
                        <DialogTitle className="font-display text-lg text-slate-900 flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center">
                                <UserPlus className="w-4 h-4 text-emerald-600" />
                            </div>
                            Add New Lead
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div>
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Full Name *</Label>
                            <Input
                                value={form.full_name}
                                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                                placeholder="e.g. Sarah Johnson"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Email</Label>
                                <Input
                                    type="email"
                                    value={form.email}
                                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                                    placeholder="sarah@example.com"
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                />
                            </div>
                            <div>
                                <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Phone</Label>
                                <Input
                                    type="tel"
                                    value={form.phone}
                                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                                    placeholder="+91 98765 43210"
                                    className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Source</Label>
                            <select
                                value={form.lead_source}
                                onChange={(e) => setForm({ ...form, lead_source: e.target.value })}
                                className="w-full h-10 bg-white border border-slate-100 rounded-xl px-3 text-[13px] font-medium text-slate-700 focus:outline-none focus:border-slate-200"
                            >
                                {ALL_SOURCES.map((s) => (
                                    <option key={s} value={s}>{SOURCE_LABELS[s]}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Notes</Label>
                            <textarea
                                value={form.lead_notes}
                                onChange={(e) => setForm({ ...form, lead_notes: e.target.value })}
                                placeholder="Initial notes about this lead..."
                                rows={3}
                                className="w-full bg-white border border-slate-100 rounded-xl px-4 py-3 text-[13px] font-medium text-slate-700 placeholder:text-slate-300 focus:outline-none focus:border-slate-200 resize-none"
                            />
                        </div>
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="ghost" onClick={onClose} className="rounded-xl h-10 text-[13px] font-medium text-slate-400">Cancel</Button>
                        <Button
                            onClick={handleSubmit}
                            disabled={saving}
                            className="rounded-xl h-10 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                        >
                            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create Lead
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ────────────────────────── Lead Detail Panel ────────────────────────── */

function LeadDetailPanel({ lead, onClose, onStatusChange, onNotesOpen }: {
    lead: Lead;
    onClose: () => void;
    onStatusChange: (id: string, status: string) => void;
    onNotesOpen: (lead: Lead) => void;
}) {
    return (
        <div className="fixed inset-y-0 right-0 w-[420px] bg-white border-l border-slate-200 z-50 flex flex-col animate-in slide-in-from-right duration-200 shadow-xl shadow-slate-200/30">
            {/* Header */}
            <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors text-[13px] font-medium">← Back</button>
                </div>
                <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold text-lg">
                        {lead.full_name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-900">{lead.full_name}</h2>
                        <SourceBadge source={lead.lead_source} />
                    </div>
                </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Status */}
                <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">Status</h3>
                    <StatusDropdown currentStatus={lead.lead_status} onSelect={(s) => onStatusChange(lead.id, s)} />
                </div>

                {/* Contact Info */}
                <div>
                    <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Contact Info</h3>
                    <div className="space-y-2.5">
                        {lead.email && (
                            <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
                                <Mail className="w-4 h-4 text-slate-300" />
                                <span>{lead.email}</span>
                            </div>
                        )}
                        {lead.phone && (
                            <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
                                <Phone className="w-4 h-4 text-slate-300" />
                                <span>{lead.phone}</span>
                            </div>
                        )}
                        <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
                            <Sparkles className="w-4 h-4 text-slate-300" />
                            <span>First contact: {formatDate(lead.created_at)}</span>
                        </div>
                        {lead.last_contacted_at && (
                            <div className="flex items-center gap-2.5 text-[13px] text-slate-600">
                                <MessageSquare className="w-4 h-4 text-slate-300" />
                                <span>Last contacted: {timeAgo(lead.last_contacted_at)}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Conversations */}
                {lead.conversations && lead.conversations.length > 0 && (
                    <div>
                        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Conversations</h3>
                        <div className="space-y-2">
                            {lead.conversations.map((c) => (
                                <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <div className="flex items-center gap-2">
                                        <MessageSquare className="w-4 h-4 text-slate-300" />
                                        <span className="text-[13px] text-slate-600 capitalize font-medium">{c.channel}</span>
                                    </div>
                                    <span className="text-[11px] text-slate-400">{timeAgo(c.last_message_at)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Bookings */}
                {lead.bookings && lead.bookings.length > 0 && (
                    <div>
                        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-3">Bookings</h3>
                        <div className="space-y-2">
                            {lead.bookings.map((b) => (
                                <div key={b.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                    <span className="text-[13px] text-slate-600 capitalize font-medium">{b.status}</span>
                                    <span className="text-[11px] text-slate-400">{formatDate(b.starts_at)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Notes */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Notes</h3>
                        <button
                            onClick={() => onNotesOpen(lead)}
                            className="text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                        >
                            Edit
                        </button>
                    </div>
                    <p className="text-[13px] text-slate-600 whitespace-pre-wrap leading-relaxed">
                        {lead.lead_notes || <span className="text-slate-300 italic">No notes yet</span>}
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ────────────────────────── Main Page ────────────────────────── */

export default function LeadsPage() {

    /* ── State ── */
    const [leads, setLeads] = useState<Lead[]>([]);
    const [metrics, setMetrics] = useState<Metrics | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState("");
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [sourceFilter, setSourceFilter] = useState<string | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [notesLead, setNotesLead] = useState<Lead | null>(null);
    const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
    const [sourceDropdownOpen, setSourceDropdownOpen] = useState(false);

    /* ── Fetch ── */
    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter) params.status = statusFilter;
            if (sourceFilter) params.source = sourceFilter;
            if (search.trim()) params.search = search.trim();

            const [leadsData, metricsData] = await Promise.all([
                listLeads(params),
                getLeadMetrics(),
            ]);
            setLeads(leadsData);
            setMetrics(metricsData);
        } catch (err) {
            console.error("Failed to fetch leads:", err);
            toast.error("Failed to load leads");
        } finally {
            setLoading(false);
        }
    }, [statusFilter, sourceFilter, search]);

    useEffect(() => { fetchData(); }, [fetchData]);

    /* ── Actions ── */
    const handleStatusChange = async (id: string, newStatus: string) => {
        try {
            await updateLeadStatus(id, newStatus);
            toast.success(`Status → ${STATUS_CONFIG[newStatus]?.label}`);
            setLeads((prev) => prev.map((l) => l.id === id ? { ...l, lead_status: newStatus } : l));
            if (selectedLead?.id === id) setSelectedLead((prev) => prev ? { ...prev, lead_status: newStatus } : null);
            getLeadMetrics().then(setMetrics).catch(() => { });
        } catch {
            toast.error("Failed to update status");
        }
    };

    const handleNotesSave = async (id: string, notes: string) => {
        try {
            await updateLeadNotes(id, notes);
            toast.success("Notes saved");
            setLeads((prev) => prev.map((l) => l.id === id ? { ...l, lead_notes: notes } : l));
            if (selectedLead?.id === id) setSelectedLead((prev) => prev ? { ...prev, lead_notes: notes } : null);
            setNotesLead(null);
        } catch {
            toast.error("Failed to save notes");
        }
    };

    /* ── Computed ── */
    const activePipeline = useMemo(() => {
        if (!metrics) return 0;
        return metrics.contacted + metrics.in_progress + metrics.qualified + metrics.booking_sent;
    }, [metrics]);

    /* ── Render ── */
    return (
        <div className={`space-y-6 transition-all duration-200 ${selectedLead ? "mr-[420px]" : ""}`}>
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Leads Pipeline
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Track and convert your potential customers
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={fetchData}
                        className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500 hover:text-slate-900"
                    >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => setShowAddModal(true)}
                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                    >
                        <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Lead
                    </Button>
                </div>
            </div>

            {/* ── Metrics Bar ── */}
            {metrics && (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    <MetricCard label="Total Leads" value={metrics.total} icon={Users} accent="bg-slate-500" />
                    <MetricCard label="New" value={metrics.new} icon={Sparkles} accent="bg-blue-500" />
                    <MetricCard label="Active Pipeline" value={activePipeline} icon={TrendingUp} accent="bg-amber-500" />
                    <MetricCard label="Converted" value={metrics.converted} icon={ArrowUpRight} accent="bg-emerald-500" />
                    <MetricCard label="Conversion Rate" value={`${metrics.conversion_rate}%`} icon={TrendingUp} accent="bg-violet-500" />
                </div>
            )}

            {/* ── Filters ── */}
            <div className="flex items-center gap-3 flex-wrap p-3 bg-slate-50 border border-slate-100 rounded-xl">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px] max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-300" />
                    <Input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search leads..."
                        className="pl-9 rounded-xl h-9 text-[13px] font-medium border-slate-100 focus-visible:ring-0 bg-white"
                    />
                </div>

                <div className="shrink-0 h-6 w-px bg-slate-200 mx-1" />

                {/* Status filter pills */}
                <div className="flex items-center gap-1 flex-wrap">
                    <button
                        onClick={() => setStatusFilter(null)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${!statusFilter ? "bg-slate-900 text-white shadow-sm" : "text-slate-400 hover:text-slate-600 hover:bg-white"}`}
                    >
                        All
                    </button>
                    {ALL_STATUSES.map((s) => {
                        const cfg = STATUS_CONFIG[s];
                        return (
                            <button
                                key={s}
                                onClick={() => setStatusFilter(statusFilter === s ? null : s)}
                                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1 ${statusFilter === s ? `${cfg.bg} ${cfg.color} border` : "text-slate-400 hover:text-slate-600 hover:bg-white"}`}
                            >
                                <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                                {cfg.label}
                            </button>
                        );
                    })}
                </div>

                <div className="shrink-0 h-6 w-px bg-slate-200 mx-1" />

                {/* Source dropdown */}
                <div className="relative">
                    <button
                        onClick={() => setSourceDropdownOpen(!sourceDropdownOpen)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-slate-400 hover:text-slate-600 hover:bg-white transition-all"
                    >
                        <Filter className="w-3 h-3" />
                        {sourceFilter ? SOURCE_LABELS[sourceFilter] : "Source"}
                        <ChevronDown className="w-3 h-3" />
                    </button>
                    {sourceDropdownOpen && (
                        <>
                            <div className="fixed inset-0 z-40" onClick={() => setSourceDropdownOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 z-50 w-40 bg-white border border-slate-200 rounded-xl shadow-lg shadow-slate-200/50 py-1.5 animate-in fade-in slide-in-from-top-1 duration-150">
                                <button
                                    onClick={() => { setSourceFilter(null); setSourceDropdownOpen(false); }}
                                    className={`w-full px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-50 transition-colors ${!sourceFilter ? "text-slate-900" : "text-slate-400"}`}
                                >
                                    All Sources
                                </button>
                                {ALL_SOURCES.map((s) => (
                                    <button
                                        key={s}
                                        onClick={() => { setSourceFilter(s); setSourceDropdownOpen(false); }}
                                        className={`w-full px-3 py-2 text-left text-[13px] font-medium hover:bg-slate-50 transition-colors ${sourceFilter === s ? "text-slate-900" : "text-slate-400"}`}
                                    >
                                        {SOURCE_LABELS[s]}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                </div>

                {/* Clear filters */}
                {(statusFilter || sourceFilter || search) && (
                    <button
                        onClick={() => { setStatusFilter(null); setSourceFilter(null); setSearch(""); }}
                        className="text-[11px] font-semibold text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
                    >
                        <XCircle className="w-3.5 h-3.5" />
                        Clear
                    </button>
                )}
            </div>

            {/* ── Leads Table ── */}
            <div className="rounded-2xl border border-slate-100 overflow-hidden bg-white">
                {/* Table header */}
                <div className="grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.8fr_0.8fr_40px] gap-4 px-5 py-3 border-b border-slate-100 bg-slate-50/50">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Lead</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Source</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Last Contacted</span>
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Created</span>
                    <span />
                </div>

                {/* Loading */}
                {loading && (
                    <div className="flex items-center justify-center py-16 gap-2">
                        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                        <span className="text-[13px] text-slate-300 font-medium">Loading leads...</span>
                    </div>
                )}

                {/* Empty */}
                {!loading && leads.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center m-4">
                        <UserPlus className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                        <h3 className="text-slate-600 font-semibold mb-1">No leads yet</h3>
                        <p className="text-[13px] text-slate-400 max-w-xs mx-auto mb-4">
                            {statusFilter || sourceFilter || search
                                ? "No leads match your filters. Try adjusting them."
                                : "Add your first lead or they'll appear here automatically from messages and forms."}
                        </p>
                        {!(statusFilter || sourceFilter || search) && (
                            <Button
                                size="sm"
                                onClick={() => setShowAddModal(true)}
                                className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                            >
                                <Plus className="w-3.5 h-3.5 mr-1.5" />
                                Add First Lead
                            </Button>
                        )}
                    </div>
                )}

                {/* Rows */}
                {!loading && leads.map((lead) => (
                    <div
                        key={lead.id}
                        onClick={() => setSelectedLead(lead)}
                        className={`grid grid-cols-[2fr_1.2fr_0.8fr_1fr_0.8fr_0.8fr_40px] gap-4 px-5 py-3.5 border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${selectedLead?.id === lead.id ? "bg-slate-50" : "bg-white"}`}
                    >
                        {/* Name + avatar */}
                        <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${lead.lead_status === "new" ? "bg-blue-50 text-blue-600 border border-blue-100 ring-2 ring-blue-50" : "bg-slate-100 text-slate-500"}`}>
                                {lead.full_name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[13px] font-semibold text-slate-800 truncate">{lead.full_name}</p>
                                {lead.lead_notes && (
                                    <p className="text-[11px] text-slate-400 truncate">{lead.lead_notes}</p>
                                )}
                            </div>
                        </div>

                        {/* Contact */}
                        <div className="flex flex-col justify-center min-w-0">
                            {lead.email && <p className="text-[13px] text-slate-600 truncate">{lead.email}</p>}
                            {lead.phone && <p className="text-[11px] text-slate-400 truncate">{lead.phone}</p>}
                            {!lead.email && !lead.phone && <span className="text-[11px] text-slate-300">—</span>}
                        </div>

                        {/* Source */}
                        <div className="flex items-center">
                            <SourceBadge source={lead.lead_source} />
                        </div>

                        {/* Status */}
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <StatusDropdown currentStatus={lead.lead_status} onSelect={(s) => handleStatusChange(lead.id, s)} />
                        </div>

                        {/* Last contacted */}
                        <div className="flex items-center">
                            <span className="text-[13px] text-slate-400 font-medium">{timeAgo(lead.last_contacted_at)}</span>
                        </div>

                        {/* Created */}
                        <div className="flex items-center">
                            <span className="text-[13px] text-slate-400 font-medium">{timeAgo(lead.created_at)}</span>
                        </div>

                        {/* Notes button */}
                        <div className="flex items-center" onClick={(e) => e.stopPropagation()}>
                            <button
                                onClick={() => setNotesLead(lead)}
                                className="p-1.5 rounded-lg text-slate-300 hover:text-emerald-600 hover:bg-emerald-50 transition-colors"
                                title="Notes"
                            >
                                <StickyNote className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Lead count */}
            {!loading && leads.length > 0 && (
                <p className="text-[11px] text-slate-400 font-medium text-right">
                    Showing {leads.length} lead{leads.length !== 1 ? "s" : ""}
                </p>
            )}

            {/* ── Detail Panel ── */}
            {selectedLead && (
                <>
                    <div className="fixed inset-0 bg-black/5 z-40 lg:hidden" onClick={() => setSelectedLead(null)} />
                    <LeadDetailPanel
                        lead={selectedLead}
                        onClose={() => setSelectedLead(null)}
                        onStatusChange={handleStatusChange}
                        onNotesOpen={setNotesLead}
                    />
                </>
            )}

            {/* ── Modals ── */}
            <AddLeadModal open={showAddModal} onClose={() => setShowAddModal(false)} onCreated={fetchData} />
            <NotesModal lead={notesLead} open={!!notesLead} onClose={() => setNotesLead(null)} onSave={handleNotesSave} />
        </div>
    );
}
