"use client";

import { useEffect, useState, useCallback } from "react";
import { useWorkspaceStore } from "@/stores/workspace-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import FormBuilder, { type FormSchema } from "@/components/features/forms/form-builder";
import api, { markFormSubmissionsRead } from "@/lib/api";
import {
    FileText,
    Plus,
    RefreshCw,
    Copy,
    Check,
    Pencil,
    Trash2,
    ExternalLink,
    Loader2,
    ClipboardList,
    Link2,
    User,
    Mail,
    ChevronLeft,
    Calendar,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface FormRecord {
    id: string;
    title: string;
    description: string | null;
    schema: FormSchema;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

interface FormSubmission {
    id: string;
    form_id: string;
    contact_id: string | null;
    data: Record<string, string>;
    created_at: string;
    forms?: { title: string };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function FormsPage() {
    const profile = useWorkspaceStore((s) => s.profile);
    const [forms, setForms] = useState<FormRecord[]>([]);
    const [submissions, setSubmissions] = useState<FormSubmission[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState("forms");

    // Builder state
    const [showBuilder, setShowBuilder] = useState(false);
    const [editingForm, setEditingForm] = useState<FormRecord | null>(null);
    const [saving, setSaving] = useState(false);
    const [copied, setCopied] = useState<string | null>(null);

    // ── Data Fetching ────────────────────────────────────────────────────

    const fetchForms = useCallback(async () => {
        if (!profile) return;
        try {
            const { data } = await api.get("/api/v1/forms");
            setForms(data || []);
        } catch (err) {
            console.error("Failed to fetch forms:", err);
        }
    }, [profile]);

    const fetchSubmissions = useCallback(async () => {
        if (!profile) return;
        try {
            const { data } = await api.get("/api/v1/forms/submissions");
            setSubmissions(data || []);
        } catch (err) {
            console.error("Failed to fetch submissions:", err);
        }
    }, [profile]);

    const fetchAll = useCallback(async () => {
        setLoading(true);
        await Promise.all([fetchForms(), fetchSubmissions()]);
        setLoading(false);
    }, [fetchForms, fetchSubmissions]);

    useEffect(() => {
        fetchAll();
    }, [fetchAll]);

    // Mark submissions as read when the submissions tab is active
    useEffect(() => {
        if (tab === "submissions" && submissions.length > 0) {
            markFormSubmissionsRead().catch(() => { });
        }
    }, [tab, submissions.length]);

    // ── Actions ──────────────────────────────────────────────────────────

    async function handleSaveForm(title: string, description: string, schema: FormSchema) {
        setSaving(true);
        try {
            if (editingForm) {
                await api.patch(`/api/v1/forms/${editingForm.id}`, {
                    title,
                    description,
                    schema,
                });
            } else {
                await api.post("/api/v1/forms", {
                    title,
                    description,
                    schema,
                });
            }
            setShowBuilder(false);
            setEditingForm(null);
            await fetchForms();
        } catch (err) {
            console.error("Failed to save form:", err);
        } finally {
            setSaving(false);
        }
    }

    async function handleDeleteForm(formId: string) {
        if (!confirm("Delete this form and all its submissions?")) return;
        try {
            await api.delete(`/api/v1/forms/${formId}`);
            await fetchForms();
        } catch (err) {
            console.error("Failed to delete form:", err);
        }
    }

    async function handleToggleActive(formId: string, isActive: boolean) {
        try {
            await api.patch(`/api/v1/forms/${formId}`, { is_active: !isActive });
            await fetchForms();
        } catch (err) {
            console.error("Failed to toggle form:", err);
        }
    }

    function copyShareLink(formId: string) {
        const url = `${window.location.origin}/f/${formId}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopied(formId);
            setTimeout(() => setCopied(null), 2000);
        });
    }

    function openEditForm(form: FormRecord) {
        setEditingForm(form);
        setShowBuilder(true);
    }

    function formatDate(iso: string) {
        return new Date(iso).toLocaleDateString([], {
            weekday: "short",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }

    // ── Builder View ─────────────────────────────────────────────────────

    if (showBuilder) {
        return (
            <div className="space-y-5">
                <div className="flex items-center gap-3">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-medium text-slate-400 hover:text-slate-600 gap-1.5"
                        onClick={() => {
                            setShowBuilder(false);
                            setEditingForm(null);
                        }}
                    >
                        <ChevronLeft className="w-4 h-4" /> Back
                    </Button>
                    <div>
                        <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                            {editingForm ? "Edit Form" : "Create Form"}
                        </h1>
                        <p className="text-[13px] text-slate-400 font-medium mt-0.5">
                            {editingForm ? "Update your form fields and settings" : "Build a new form for your customers"}
                        </p>
                    </div>
                </div>
                <FormBuilder
                    initialTitle={editingForm?.title}
                    initialDescription={editingForm?.description || ""}
                    initialSchema={editingForm?.schema}
                    onSave={handleSaveForm}
                    onCancel={() => {
                        setShowBuilder(false);
                        setEditingForm(null);
                    }}
                    saving={saving}
                />
            </div>
        );
    }

    // ── Main View ────────────────────────────────────────────────────────

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Forms
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Build forms, share links, and track submissions
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500 hover:text-slate-900"
                        onClick={fetchAll}
                    >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
                    </Button>
                    <Button
                        size="sm"
                        className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                        onClick={() => {
                            setEditingForm(null);
                            setShowBuilder(true);
                        }}
                    >
                        <Plus className="w-3.5 h-3.5" /> Create Form
                    </Button>
                </div>
            </div>

            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="bg-slate-100/50 rounded-xl h-11 p-1 border border-slate-100">
                    <TabsTrigger
                        value="forms"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <FileText className="w-3.5 h-3.5 mr-2" /> Forms ({forms.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="submissions"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <ClipboardList className="w-3.5 h-3.5 mr-2" /> Submissions ({submissions.length})
                    </TabsTrigger>
                </TabsList>

                {/* ── Forms Tab ───────────────────────────────────── */}
                <TabsContent value="forms" className="mt-6 space-y-4">
                    {/* Contact Form Link */}
                    <div className="flex items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-100 rounded-xl">
                        <div className="flex items-center gap-3 flex-1">
                            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                <Link2 className="w-4 h-4 text-blue-500" />
                            </div>
                            <div>
                                <p className="text-[13px] font-semibold text-slate-900">Contact Form</p>
                                <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                                    Public lead capture form — always available
                                </p>
                            </div>
                        </div>
                        <a
                            href={`/c/${profile?.workspaceSlug}`}
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            <Button
                                variant="outline"
                                size="sm"
                                className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500 hover:text-slate-900 gap-1.5"
                            >
                                <ExternalLink className="w-3.5 h-3.5" /> Open
                            </Button>
                        </a>
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-16 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            <span className="text-[13px] text-slate-300 font-medium">Loading forms...</span>
                        </div>
                    ) : forms.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">
                                No forms created yet
                            </p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                                Create a form to start collecting information from your customers.
                            </p>
                            <Button
                                size="sm"
                                className="rounded-xl h-9 text-[13px] font-semibold gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200 mt-5"
                                onClick={() => {
                                    setEditingForm(null);
                                    setShowBuilder(true);
                                }}
                            >
                                <Plus className="w-3.5 h-3.5" /> Create Your First Form
                            </Button>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {forms.map((form) => (
                                <Card key={form.id} className="rounded-2xl border-slate-100 shadow-sm hover:shadow-md transition-shadow group">
                                    <CardContent className="p-5">
                                        <div className="flex items-start justify-between">
                                            <div className="space-y-1.5 flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-[14px] font-bold text-slate-900 tracking-tight truncate">
                                                        {form.title}
                                                    </h3>
                                                    <Badge
                                                        variant="outline"
                                                        className={`rounded-full text-[10px] font-semibold px-2 shrink-0 ${form.is_active
                                                            ? "bg-emerald-50 text-emerald-600 border-emerald-200"
                                                            : "bg-slate-50 text-slate-400 border-slate-200"
                                                            }`}
                                                    >
                                                        {form.is_active ? "Active" : "Inactive"}
                                                    </Badge>
                                                </div>
                                                {form.description && (
                                                    <p className="text-[12px] text-slate-400 font-medium line-clamp-1">
                                                        {form.description}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium">
                                                    {form.schema?.fields && (
                                                        <span>{form.schema.fields.length} {form.schema.fields.length === 1 ? "field" : "fields"}</span>
                                                    )}
                                                    <span>Created {formatDate(form.created_at)}</span>
                                                </div>
                                            </div>
                                            <div className="shrink-0 ml-3">
                                                <Switch
                                                    checked={form.is_active}
                                                    onCheckedChange={() =>
                                                        handleToggleActive(form.id, form.is_active)
                                                    }
                                                />
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1.5 mt-4 pt-4 border-t border-slate-100">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => copyShareLink(form.id)}
                                                className="rounded-xl h-8 text-[12px] font-medium border-slate-100 text-slate-500 hover:text-slate-900 gap-1.5 flex-1"
                                            >
                                                {copied === form.id ? (
                                                    <><Check className="w-3 h-3 text-emerald-500" /> Copied!</>
                                                ) : (
                                                    <><Copy className="w-3 h-3" /> Copy Link</>
                                                )}
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => openEditForm(form)}
                                                className="rounded-xl h-8 text-[12px] font-medium border-slate-100 text-slate-500 hover:text-slate-900 gap-1.5"
                                            >
                                                <Pencil className="w-3 h-3" /> Edit
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleDeleteForm(form.id)}
                                                className="rounded-xl h-8 w-8 p-0 border-slate-100 text-rose-400 hover:text-rose-500 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </TabsContent>

                {/* ── Submissions Tab ─────────────────────────────── */}
                <TabsContent value="submissions" className="mt-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 gap-2">
                            <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                            <span className="text-[13px] text-slate-300 font-medium">Loading submissions...</span>
                        </div>
                    ) : submissions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <ClipboardList className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">
                                No submissions yet
                            </p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                                Share your forms to start receiving responses from customers.
                            </p>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-slate-100 overflow-hidden">
                            {/* Table header */}
                            <div className="grid grid-cols-[1fr_1fr_1fr_130px] gap-4 bg-slate-50 border-b border-slate-100 px-5 py-3">
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Contact</span>
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Form</span>
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Details</span>
                                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Submitted</span>
                            </div>
                            {submissions.map((sub) => (
                                <div
                                    key={sub.id}
                                    className="grid grid-cols-[1fr_1fr_1fr_130px] gap-4 px-5 py-3.5 border-b border-slate-50 last:border-b-0 hover:bg-slate-50/50 transition-colors"
                                >
                                    <div className="min-w-0">
                                        <p className="text-[13px] font-semibold text-slate-900 truncate">
                                            {sub.data?.name || "Anonymous"}
                                        </p>
                                        {sub.data?.email && (
                                            <p className="text-[11px] text-slate-400 truncate mt-0.5 flex items-center gap-1">
                                                <Mail className="w-3 h-3 shrink-0" /> {sub.data.email}
                                            </p>
                                        )}
                                    </div>
                                    <div className="self-center">
                                        {sub.forms?.title && (
                                            <Badge
                                                variant="outline"
                                                className="rounded-full text-[10px] font-semibold px-2.5 bg-blue-50 text-blue-600 border-blue-200"
                                            >
                                                {sub.forms.title}
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="min-w-0 self-center">
                                        {Object.entries(sub.data || {}).map(([key, value]) => {
                                            if (key === "name" || key === "email") return null;
                                            return (
                                                <p
                                                    key={key}
                                                    className="text-[12px] text-slate-500 truncate"
                                                >
                                                    <span className="text-slate-400 font-medium">{key}:</span>{" "}
                                                    {String(value).slice(0, 80)}
                                                    {String(value).length > 80 ? "…" : ""}
                                                </p>
                                            );
                                        })}
                                    </div>
                                    <span className="text-[12px] text-slate-400 font-medium self-center">
                                        {formatDate(sub.created_at)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
}
