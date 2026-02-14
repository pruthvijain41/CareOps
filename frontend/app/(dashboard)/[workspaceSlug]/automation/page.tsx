"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
    Zap,
    Play,
    Pause,
    Trash2,
    Plus,
    ScrollText,
    Pencil,
    X,
    Clock,
    Mail,
    Bell,
    FileText,
    AlertTriangle,
    MessageSquare,
    Check,
    ChevronRight,
    Eye,
    Search,
    ArrowRight,
    CheckCircle2,
    XCircle,
    Activity,
    Sparkles,
} from "lucide-react";
import { toast } from "sonner";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface AutomationRule {
    id: string;
    name: string;
    trigger: string;
    action: string;
    config: Record<string, any>;
    action_config?: Record<string, any>;
    trigger_config?: Record<string, any>;
    is_active: boolean;
    created_at: string;
}

interface AutomationLog {
    id: string;
    rule_id: string;
    status: string;
    trigger_payload: Record<string, any>;
    action_result: Record<string, any>;
    created_at: string;
    automation_rules?: {
        name: string;
        trigger: string;
        action: string;
    };
}

/* ─── Label Maps ─────────────────────────────────────────────────────────── */

const TRIGGER_LABELS: Record<string, string> = {
    new_lead: "Contact form submitted",
    booking_confirmed: "Booking confirmed",
    booking_created: "Booking created",
    booking_completed: "Booking completed",
    booking_cancelled: "Booking cancelled",
    booking_reminder: "24 hours before appointment",
    message_received: "Staff sends manual reply",
    inventory_low: "Item below threshold",
    form_submitted: "Form submitted / pending",
};

const TRIGGER_ICONS: Record<string, React.ReactNode> = {
    new_lead: <Mail className="w-3.5 h-3.5" />,
    booking_confirmed: <Check className="w-3.5 h-3.5" />,
    booking_created: <Plus className="w-3.5 h-3.5" />,
    booking_completed: <CheckCircle2 className="w-3.5 h-3.5" />,
    booking_cancelled: <XCircle className="w-3.5 h-3.5" />,
    booking_reminder: <Clock className="w-3.5 h-3.5" />,
    message_received: <MessageSquare className="w-3.5 h-3.5" />,
    inventory_low: <AlertTriangle className="w-3.5 h-3.5" />,
    form_submitted: <FileText className="w-3.5 h-3.5" />,
};

const ACTION_LABELS: Record<string, string> = {
    send_email: "Send email",
    send_notification: "Send notification",
    notify_owner: "Notify owner",
    send_form: "Send form link",
    distribute_form: "Send form link",
    send_telegram: "Send Telegram",
    create_calendar_event: "Create calendar event",
    adjust_inventory: "Adjust stock",
    pause_automation: "Pause automation",
};

const ACTION_ICONS: Record<string, React.ReactNode> = {
    send_email: <Mail className="w-3.5 h-3.5" />,
    notify_owner: <Bell className="w-3.5 h-3.5" />,
    send_notification: <Bell className="w-3.5 h-3.5" />,
    distribute_form: <FileText className="w-3.5 h-3.5" />,
    send_form: <FileText className="w-3.5 h-3.5" />,
    pause_automation: <Pause className="w-3.5 h-3.5" />,
};

const AVAILABLE_TRIGGERS = Object.keys(TRIGGER_LABELS);
const AVAILABLE_ACTIONS = [
    "send_email",
    "notify_owner",
    "distribute_form",
    "pause_automation",
];

const TEMPLATE_VARIABLES = [
    { key: "{{contact_name}}", label: "Contact Name" },
    { key: "{{contact_email}}", label: "Contact Email" },
    { key: "{{booking_date}}", label: "Booking Date" },
    { key: "{{booking_time}}", label: "Booking Time" },
    { key: "{{form_url}}", label: "Form Link" },
    { key: "{{item_name}}", label: "Item Name" },
    { key: "{{quantity}}", label: "Quantity" },
    { key: "{{unit}}", label: "Unit" },
];

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

/* ─── Edit Template Dialog ───────────────────────────────────────────────── */

function EditTemplateDialog({
    rule,
    open,
    onSave,
    onClose,
}: {
    rule: AutomationRule;
    open: boolean;
    onSave: (ruleId: string, config: Record<string, any>) => Promise<void>;
    onClose: () => void;
}) {
    const cfg = rule.config || rule.action_config || {};
    const [subject, setSubject] = useState(cfg.subject || "");
    const [body, setBody] = useState(cfg.body || cfg.message || "");
    const [delayMinutes, setDelayMinutes] = useState(cfg.delay_minutes ?? 0);
    const [saving, setSaving] = useState(false);
    const [showPreview, setShowPreview] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(rule.id, {
                ...cfg,
                subject,
                body: body || undefined,
                message: body || undefined,
                delay_minutes: delayMinutes,
            });
            onClose();
        } catch {
            toast.error("Failed to save template");
        } finally {
            setSaving(false);
        }
    };

    const insertVariable = (varKey: string) => {
        setBody((prev: string) => prev + " " + varKey);
    };

    // Build a preview string with sample values
    const previewBody = body
        .replace(/\{\{contact_name\}\}/g, "Sarah Johnson")
        .replace(/\{\{contact_email\}\}/g, "sarah@example.com")
        .replace(/\{\{booking_date\}\}/g, "Feb 15, 2026")
        .replace(/\{\{booking_time\}\}/g, "10:00 AM")
        .replace(/\{\{form_url\}\}/g, "https://forms.careops.app/abc123")
        .replace(/\{\{item_name\}\}/g, "Latex Gloves")
        .replace(/\{\{quantity\}\}/g, "5")
        .replace(/\{\{unit\}\}/g, "boxes");

    const previewSubject = subject
        .replace(/\{\{contact_name\}\}/g, "Sarah Johnson")
        .replace(/\{\{booking_date\}\}/g, "Feb 15, 2026")
        .replace(/\{\{booking_time\}\}/g, "10:00 AM");

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[560px] rounded-2xl border-slate-100 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                        Edit Template
                    </DialogTitle>
                    <p className="text-[13px] text-slate-400 font-medium mt-0.5">
                        {rule.name}
                    </p>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                    {/* Subject */}
                    {(rule.action === "send_email" || rule.action === "distribute_form") && (
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Email Subject
                            </Label>
                            <Input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="e.g. Booking Confirmation — {{booking_date}}"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                    )}

                    {/* Body */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            {rule.action === "send_email" || rule.action === "distribute_form"
                                ? "Email Body"
                                : "Message"}
                        </Label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={5}
                            placeholder="Hi {{contact_name}}, ..."
                            className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[13px] font-medium resize-none focus:outline-none focus:border-slate-200 transition-colors"
                        />
                    </div>

                    {/* Variables */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Insert Variable
                        </Label>
                        <div className="flex flex-wrap gap-1.5">
                            {TEMPLATE_VARIABLES.map((v) => (
                                <button
                                    key={v.key}
                                    onClick={() => insertVariable(v.key)}
                                    className="px-2.5 py-1 rounded-lg bg-blue-50 text-blue-600 text-[11px] font-semibold hover:bg-blue-100 transition-colors"
                                >
                                    {v.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Delay */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Delay
                        </Label>
                        <div className="flex items-center gap-3">
                            <Input
                                type="number"
                                min={0}
                                value={delayMinutes}
                                onChange={(e) => setDelayMinutes(parseInt(e.target.value) || 0)}
                                className="rounded-xl h-10 w-24 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                            <span className="text-[13px] text-slate-400 font-medium">
                                {delayMinutes === 0
                                    ? "Send immediately"
                                    : delayMinutes < 60
                                        ? `Send after ${delayMinutes} min`
                                        : `Send after ${Math.round(delayMinutes / 60)} hr`}
                            </span>
                        </div>
                    </div>

                    {/* Preview */}
                    <div className="space-y-2">
                        <button
                            onClick={() => setShowPreview(!showPreview)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider hover:text-slate-600 transition-colors"
                        >
                            <Eye className="w-3.5 h-3.5" />
                            {showPreview ? "Hide Preview" : "Show Preview"}
                        </button>
                        {showPreview && (
                            <div className="rounded-xl bg-slate-50 border border-slate-100 p-4 space-y-2">
                                {previewSubject && (
                                    <p className="text-[13px] font-semibold text-slate-700">
                                        Subject: {previewSubject}
                                    </p>
                                )}
                                <p className="text-[13px] text-slate-500 leading-relaxed whitespace-pre-wrap">
                                    {previewBody || "(empty)"}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter className="gap-2 mt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                    >
                        {saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving...</>
                        ) : (
                            <><Check className="w-3.5 h-3.5" /> Save Template</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ─── Add Rule Dialog ────────────────────────────────────────────────────── */

function AddRuleDialog({
    open,
    onSave,
    onClose,
}: {
    open: boolean;
    onSave: (rule: { name: string; trigger: string; action: string; config: Record<string, any> }) => Promise<void>;
    onClose: () => void;
}) {
    const [name, setName] = useState("");
    const [trigger, setTrigger] = useState("new_lead");
    const [action, setAction] = useState("send_email");
    const [subject, setSubject] = useState("");
    const [body, setBody] = useState("");
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!name.trim()) {
            toast.error("Please enter a rule name");
            return;
        }
        setSaving(true);
        try {
            await onSave({
                name,
                trigger,
                action,
                config: { subject, body, delay_minutes: 0 },
            });
            onClose();
        } catch {
            toast.error("Failed to create rule");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
            <DialogContent className="sm:max-w-[520px] rounded-2xl border-slate-100 max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                        Create Automation Rule
                    </DialogTitle>
                    <p className="text-[13px] text-slate-400 font-medium mt-0.5">
                        Define what triggers this rule and what action it takes
                    </p>
                </DialogHeader>

                <div className="space-y-5 mt-2">
                    {/* Name */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Rule Name <span className="text-rose-400">*</span>
                        </Label>
                        <Input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Welcome New Contact"
                            className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                        />
                    </div>

                    {/* Trigger */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            When this happens...
                        </Label>
                        <select
                            value={trigger}
                            onChange={(e) => setTrigger(e.target.value)}
                            className="w-full rounded-xl h-10 border border-slate-100 bg-white px-3 text-[13px] font-medium focus:outline-none focus:border-slate-200 transition-colors"
                        >
                            {AVAILABLE_TRIGGERS.map((t) => (
                                <option key={t} value={t}>
                                    {TRIGGER_LABELS[t] || t}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Action */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Then do this...
                        </Label>
                        <select
                            value={action}
                            onChange={(e) => setAction(e.target.value)}
                            className="w-full rounded-xl h-10 border border-slate-100 bg-white px-3 text-[13px] font-medium focus:outline-none focus:border-slate-200 transition-colors"
                        >
                            {AVAILABLE_ACTIONS.map((a) => (
                                <option key={a} value={a}>
                                    {ACTION_LABELS[a] || a}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Subject */}
                    {(action === "send_email" || action === "distribute_form") && (
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                                Email Subject
                            </Label>
                            <Input
                                type="text"
                                value={subject}
                                onChange={(e) => setSubject(e.target.value)}
                                placeholder="Subject line..."
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                    )}

                    {/* Body */}
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Message Body
                        </Label>
                        <textarea
                            value={body}
                            onChange={(e) => setBody(e.target.value)}
                            rows={4}
                            placeholder="Hi {{contact_name}}, ..."
                            className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[13px] font-medium resize-none focus:outline-none focus:border-slate-200 transition-colors"
                        />
                    </div>
                </div>

                <DialogFooter className="gap-2 mt-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500"
                        onClick={onClose}
                    >
                        Cancel
                    </Button>
                    <Button
                        onClick={handleSave}
                        disabled={saving}
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 gap-1.5"
                    >
                        {saving ? (
                            <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Creating...</>
                        ) : (
                            <><Plus className="w-3.5 h-3.5" /> Create Rule</>
                        )}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function AutomationPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const [rules, setRules] = useState<AutomationRule[]>([]);
    const [logs, setLogs] = useState<AutomationLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [logsLoading, setLogsLoading] = useState(false);
    const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
    const [showAddModal, setShowAddModal] = useState(false);
    const [tab, setTab] = useState("rules");

    const fetchRules = useCallback(async () => {
        if (!profile) return;
        setLoading(true);
        try {
            const { data } = await api.get("/api/v1/automation/rules");
            setRules(data || []);
        } catch (err) {
            console.error("Failed to fetch rules:", err);
            setRules([]);
        } finally {
            setLoading(false);
        }
    }, [profile]);

    const fetchLogs = useCallback(async () => {
        setLogsLoading(true);
        try {
            const { data } = await api.get("/api/v1/automation/logs");
            setLogs(data || []);
        } catch (err) {
            console.error("Failed to fetch logs:", err);
        } finally {
            setLogsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchRules();
    }, [fetchRules]);

    const toggleRule = async (rule: AutomationRule) => {
        try {
            await api.patch(`/api/v1/automation/rules/${rule.id}`, {
                is_active: !rule.is_active,
            });
            setRules((prev) =>
                prev.map((r) =>
                    r.id === rule.id ? { ...r, is_active: !r.is_active } : r
                )
            );
            toast.success(rule.is_active ? "Rule deactivated" : "Rule activated");
        } catch (err) {
            console.error("Failed to toggle rule:", err);
            toast.error("Failed to toggle rule");
        }
    };

    const deleteRule = async (ruleId: string, name: string) => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        try {
            await api.delete(`/api/v1/automation/rules/${ruleId}`);
            setRules((prev) => prev.filter((r) => r.id !== ruleId));
            toast.success("Rule deleted");
        } catch (err) {
            console.error("Failed to delete rule:", err);
            toast.error("Failed to delete rule");
        }
    };

    const seedDefaults = async () => {
        try {
            await api.post("/api/v1/automation/seed-defaults");
            toast.success("Default rules created");
            fetchRules();
        } catch (err) {
            console.error("Failed to seed defaults:", err);
            toast.error("Failed to setup defaults");
        }
    };

    const saveTemplate = async (ruleId: string, config: Record<string, any>) => {
        await api.patch(`/api/v1/automation/rules/${ruleId}`, { config });
        setRules((prev) =>
            prev.map((r) =>
                r.id === ruleId ? { ...r, config, action_config: config } : r
            )
        );
        toast.success("Template saved");
    };

    const createRule = async (rule: {
        name: string;
        trigger: string;
        action: string;
        config: Record<string, any>;
    }) => {
        await api.post("/api/v1/automation/rules", rule);
        toast.success("Rule created");
        fetchRules();
    };

    const getConfig = (rule: AutomationRule) => {
        return rule.config || rule.action_config || {};
    };

    const getDelay = (rule: AutomationRule) => {
        const cfg = getConfig(rule);
        const mins = cfg.delay_minutes ?? 0;
        if (mins === 0) return "Immediately";
        if (mins < 60) return `After ${mins} min`;
        return `After ${Math.round(mins / 60)} hr`;
    };

    const getChannel = (rule: AutomationRule) => {
        const cfg = getConfig(rule);
        return cfg.channel || (rule.action.includes("email") || rule.action.includes("form") ? "email" : "notification");
    };

    const getTemplatePreview = (rule: AutomationRule) => {
        const cfg = getConfig(rule);
        return cfg.body || cfg.message || cfg.subject || "—";
    };

    const activeCount = rules.filter((r) => r.is_active).length;
    const failedLogs = logs.filter((l) => l.status === "error" || l.status === "failed");

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Automations
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Rules that run automatically when events happen
                    </p>
                </div>
                <Button
                    onClick={() => setShowAddModal(true)}
                    size="sm"
                    className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                >
                    <Plus className="w-3.5 h-3.5" /> New Rule
                </Button>
            </div>

            {/* ── Summary Cards ── */}
            <div className="grid grid-cols-3 gap-4">
                <div className="rounded-2xl bg-slate-900 text-white p-5 shadow-lg shadow-slate-900/10">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Total Rules</span>
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                            <Zap className="w-4 h-4 text-emerald-400" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-white">{rules.length}</span>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Active</span>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <Play className="w-4 h-4 text-emerald-500" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{activeCount}</span>
                </div>
                <div className="rounded-2xl bg-white border border-slate-200/80 p-5 hover:border-slate-300 hover:shadow-sm transition-all duration-200">
                    <div className="flex items-center justify-between mb-4">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Paused</span>
                        <div className="w-8 h-8 rounded-lg bg-slate-50 flex items-center justify-center">
                            <Pause className="w-4 h-4 text-amber-500" />
                        </div>
                    </div>
                    <span className="text-3xl font-bold tracking-tight text-slate-900">{rules.length - activeCount}</span>
                </div>
            </div>

            {/* ── Tabs: Rules / Activity Log ── */}
            <Tabs value={tab} onValueChange={(v) => { setTab(v); if (v === "logs") fetchLogs(); }} className="w-full">
                <TabsList className="bg-slate-100/50 rounded-xl h-11 p-1 border border-slate-100">
                    <TabsTrigger
                        value="rules"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <Zap className="w-3.5 h-3.5 mr-2" /> Rules ({rules.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="logs"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <Activity className="w-3.5 h-3.5 mr-2" /> Activity Log
                    </TabsTrigger>
                </TabsList>

                {/* ── Rules Tab ── */}
                <TabsContent value="rules" className="mt-6 space-y-4">
                    {/* Loading */}
                    {loading && (
                        <div className="flex items-center justify-center py-16 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            <span className="text-[13px] text-slate-300 font-medium">Loading rules...</span>
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && rules.length === 0 && (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <Sparkles className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">
                                No automation rules yet
                            </p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-sm mx-auto">
                                Set up default rules to get started with welcome emails, booking confirmations, reminders, and more.
                            </p>
                            <div className="flex items-center justify-center gap-3 mt-5">
                                <Button
                                    onClick={seedDefaults}
                                    size="sm"
                                    className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                                >
                                    <Sparkles className="w-3.5 h-3.5" /> Set Up Defaults
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => setShowAddModal(true)}
                                    size="sm"
                                    className="rounded-xl h-9 font-semibold text-[13px] gap-2 border-slate-200 text-slate-600"
                                >
                                    <Plus className="w-3.5 h-3.5" /> Create Custom
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Rules List */}
                    {!loading && rules.length > 0 && (
                        <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                            <CardContent className="p-0 divide-y divide-slate-50">
                                {rules.map((rule) => {
                                    const cfg = getConfig(rule);
                                    const isSystemRule = cfg.is_system_rule;

                                    return (
                                        <div
                                            key={rule.id}
                                            className={`px-4 py-4 hover:bg-slate-50/50 transition-colors group ${!rule.is_active ? "opacity-50" : ""}`}
                                        >
                                            {/* Top Row: Toggle + Name + Actions */}
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                                    <Switch
                                                        checked={rule.is_active}
                                                        onCheckedChange={() => toggleRule(rule)}
                                                        className="data-[state=checked]:bg-emerald-500 shrink-0 mt-0.5"
                                                    />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-[14px] font-semibold text-slate-900 truncate">
                                                                {rule.name}
                                                            </p>
                                                            {isSystemRule && (
                                                                <Badge
                                                                    variant="outline"
                                                                    className="rounded-full text-[9px] font-semibold px-2 py-0 h-5 bg-amber-50 text-amber-600 border-amber-200 gap-1 shrink-0"
                                                                >
                                                                    <AlertTriangle className="w-2.5 h-2.5" /> System
                                                                </Badge>
                                                            )}
                                                        </div>

                                                        {/* Trigger → Action */}
                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 text-blue-600">
                                                                {TRIGGER_ICONS[rule.trigger] || <Zap className="w-3.5 h-3.5" />}
                                                                <span className="text-[11px] font-semibold">
                                                                    {TRIGGER_LABELS[rule.trigger] || rule.trigger}
                                                                </span>
                                                            </div>
                                                            <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                                            <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-50 text-emerald-600">
                                                                {ACTION_ICONS[rule.action] || <Zap className="w-3.5 h-3.5" />}
                                                                <span className="text-[11px] font-semibold">
                                                                    {ACTION_LABELS[rule.action] || rule.action}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Meta badges */}
                                                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                                                            <Badge
                                                                variant="outline"
                                                                className="rounded-full text-[10px] font-semibold px-2 py-0 h-5 bg-slate-50 text-slate-500 border-slate-200 gap-1"
                                                            >
                                                                <Clock className="w-3 h-3" />
                                                                {getDelay(rule)}
                                                            </Badge>
                                                            <Badge
                                                                variant="outline"
                                                                className="rounded-full text-[10px] font-semibold px-2 py-0 h-5 bg-slate-50 text-slate-500 border-slate-200 gap-1"
                                                            >
                                                                {getChannel(rule) === "email" ? (
                                                                    <><Mail className="w-3 h-3" /> Email</>
                                                                ) : getChannel(rule) === "system" ? (
                                                                    <><MessageSquare className="w-3 h-3" /> System</>
                                                                ) : (
                                                                    <><Bell className="w-3 h-3" /> Notification</>
                                                                )}
                                                            </Badge>
                                                        </div>

                                                        {/* Template Preview */}
                                                        {!isSystemRule && (
                                                            <p className="text-[12px] text-slate-400 mt-2 truncate max-w-lg italic">
                                                                &quot;{getTemplatePreview(rule)}&quot;
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {!isSystemRule && (
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            onClick={() => setEditingRule(rule)}
                                                            className="rounded-xl h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:text-slate-900 gap-1"
                                                        >
                                                            <Pencil className="w-3 h-3" /> Edit
                                                        </Button>
                                                    )}
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => deleteRule(rule.id, rule.name)}
                                                        className="rounded-xl h-8 w-8 p-0 text-slate-400 hover:text-rose-500 hover:bg-rose-50"
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>

                {/* ── Activity Log Tab ── */}
                <TabsContent value="logs" className="mt-6 space-y-4">
                    {logsLoading ? (
                        <div className="flex items-center justify-center py-16 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            <span className="text-[13px] text-slate-300 font-medium">Loading activity...</span>
                        </div>
                    ) : logs.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <ScrollText className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">
                                No activity yet
                            </p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                                Automation activity will appear here once rules start firing — like when a form is submitted or a booking is confirmed.
                            </p>
                        </div>
                    ) : (
                        <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                            <CardContent className="p-0 divide-y divide-slate-50">
                                {logs.slice(0, 25).map((log) => {
                                    const isFailed = log.status === "error" || log.status === "failed";
                                    return (
                                        <div key={log.id} className="px-4 py-3 flex items-start gap-3">
                                            {/* Status icon */}
                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isFailed
                                                ? "bg-rose-50 text-rose-500"
                                                : "bg-emerald-50 text-emerald-500"
                                                }`}>
                                                {isFailed ? <XCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                                            </div>

                                            {/* Details */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <p className="text-[13px] font-semibold text-slate-900 truncate">
                                                        {log.automation_rules?.name || "Unknown rule"}
                                                    </p>
                                                    <Badge
                                                        variant="outline"
                                                        className={`rounded-full text-[9px] font-semibold px-2 py-0 h-5 shrink-0 ${isFailed
                                                            ? "bg-rose-50 text-rose-500 border-rose-200"
                                                            : "bg-emerald-50 text-emerald-600 border-emerald-200"
                                                            }`}
                                                    >
                                                        {log.status === "success" ? "Sent" : log.status}
                                                    </Badge>
                                                </div>
                                                {/* Payload info */}
                                                {log.trigger_payload && (
                                                    <p className="text-[12px] text-slate-400 mt-0.5 truncate">
                                                        {log.trigger_payload.contact_name && (
                                                            <span>To {log.trigger_payload.contact_name}</span>
                                                        )}
                                                        {log.trigger_payload.contact_email && (
                                                            <span className="ml-1">({log.trigger_payload.contact_email})</span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>

                                            {/* Timestamp */}
                                            <span className="text-[11px] text-slate-300 font-medium shrink-0 mt-0.5">
                                                {log.created_at ? timeAgo(log.created_at) : "—"}
                                            </span>
                                        </div>
                                    );
                                })}
                            </CardContent>
                        </Card>
                    )}
                </TabsContent>
            </Tabs>

            {/* ── Edit Template Dialog ── */}
            {editingRule && (
                <EditTemplateDialog
                    rule={editingRule}
                    open={!!editingRule}
                    onSave={saveTemplate}
                    onClose={() => setEditingRule(null)}
                />
            )}

            {/* ── Add Rule Dialog ── */}
            <AddRuleDialog
                open={showAddModal}
                onSave={createRule}
                onClose={() => setShowAddModal(false)}
            />
        </div>
    );
}
