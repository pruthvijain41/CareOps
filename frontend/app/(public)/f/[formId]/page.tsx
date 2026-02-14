"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CheckCircle2, Loader2, FileText, AlertCircle } from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface FormField {
    id: string;
    type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "date" | "number";
    label: string;
    required: boolean;
    placeholder?: string;
    options?: string[];
}

interface PublicFormData {
    id: string;
    title: string;
    description: string | null;
    schema: { fields: FormField[] };
    workspace_name: string;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function PublicFormPage() {
    const params = useParams();
    const formId = params.formId as string;

    const [form, setForm] = useState<PublicFormData | null>(null);
    const [values, setValues] = useState<Record<string, string | boolean>>({});
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

    useEffect(() => {
        async function fetchForm() {
            try {
                const res = await fetch(`${API_URL}/api/v1/forms/public/form/${formId}`);
                if (!res.ok) {
                    setError("Form not found or inactive.");
                    return;
                }
                const data = await res.json();
                setForm(data);

                // Initialize default values keyed by field ID (for internal tracking)
                const defaults: Record<string, string | boolean> = {};
                (data.schema?.fields || []).forEach((f: FormField) => {
                    defaults[f.id] = f.type === "checkbox" ? false : "";
                });
                setValues(defaults);
            } catch {
                setError("Failed to load form.");
            } finally {
                setLoading(false);
            }
        }
        fetchForm();
    }, [formId, API_URL]);

    function validate(): boolean {
        const newErrors: Record<string, string> = {};
        const fields = form?.schema?.fields || [];
        for (const field of fields) {
            const val = values[field.id];
            if (field.required) {
                if (field.type === "checkbox" && val !== true) {
                    newErrors[field.id] = "This field is required";
                } else if (field.type !== "checkbox" && (!val || String(val).trim() === "")) {
                    newErrors[field.id] = "This field is required";
                }
            }
            if (field.type === "email" && val && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(val))) {
                newErrors[field.id] = "Invalid email address";
            }
        }
        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    }

    async function handleSubmit() {
        if (!validate()) return;
        setSubmitting(true);
        try {
            // Build data object using FIELD LABELS as keys (not IDs)
            const data: Record<string, string | boolean> = {};
            const fields = form?.schema?.fields || [];
            fields.forEach((f) => {
                data[f.label] = values[f.id];
            });

            // Extract name and email for contact creation
            const nameField = fields.find(
                (f) => f.type === "text" && f.label.toLowerCase().includes("name")
            );
            const emailField = fields.find(
                (f) => f.type === "email"
            );

            const res = await fetch(`${API_URL}/api/v1/forms/public/form/${formId}/submit`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    data,
                    name: nameField ? String(values[nameField.id]) : undefined,
                    email: emailField ? String(values[emailField.id]) : undefined,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.detail || "Submission failed");
            }

            setSubmitted(true);
        } catch (err) {
            setError(err instanceof Error ? err.message : "Submission failed");
        } finally {
            setSubmitting(false);
        }
    }

    function setValue(fieldId: string, value: string | boolean) {
        setValues((prev) => ({ ...prev, [fieldId]: value }));
        setErrors((prev) => {
            const next = { ...prev };
            delete next[fieldId];
            return next;
        });
    }

    // ── Loading ──────────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex items-center gap-2">
                    <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                    <span className="text-[13px] text-slate-400 font-medium">Loading form...</span>
                </div>
            </div>
        );
    }

    if (error && !form) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-100 p-8 text-center space-y-3">
                    <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
                    <p className="text-[14px] font-semibold text-slate-900">{error}</p>
                    <p className="text-[12px] text-slate-400">Please check the link and try again.</p>
                </div>
            </div>
        );
    }

    // ── Success ──────────────────────────────────────────────────────────

    if (submitted) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
                <div className="w-full max-w-sm bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-100 overflow-hidden">
                    <div className="p-8 text-center space-y-4">
                        <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                            <CheckCircle2 className="w-7 h-7 text-emerald-500" />
                        </div>
                        <div>
                            <h2 className="font-display font-bold text-xl tracking-tight text-slate-900">
                                Thank You!
                            </h2>
                            <p className="text-[13px] text-slate-400 font-medium mt-2">
                                Your submission has been received. We&apos;ll be in touch shortly.
                            </p>
                        </div>
                        {form?.workspace_name && (
                            <p className="text-[12px] text-slate-300 font-medium pt-2 border-t border-slate-100">
                                {form.workspace_name}
                            </p>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── Form ─────────────────────────────────────────────────────────────

    const fields = form?.schema?.fields || [];

    return (
        <div className="min-h-screen bg-slate-50 flex items-start justify-center py-10 px-4">
            <div className="w-full max-w-lg">
                <div className="bg-white rounded-2xl border border-slate-100 shadow-lg shadow-slate-100 overflow-hidden">
                    {/* Header */}
                    <div className="px-6 pt-6 pb-5 border-b border-slate-100">
                        {form?.workspace_name && (
                            <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-2">
                                {form.workspace_name}
                            </p>
                        )}
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
                                <FileText className="w-4 h-4 text-white" />
                            </div>
                            <h1 className="font-display font-bold text-lg tracking-tight text-slate-900">
                                {form?.title}
                            </h1>
                        </div>
                        {form?.description && (
                            <p className="text-[13px] text-slate-400 font-medium mt-3">
                                {form.description}
                            </p>
                        )}
                    </div>

                    {/* Fields */}
                    <div className="p-6 space-y-5">
                        {fields.map((field) => (
                            <div key={field.id} className="space-y-2">
                                {field.type !== "checkbox" && (
                                    <Label className="text-[12px] font-semibold text-slate-600">
                                        {field.label}
                                        {field.required && (
                                            <span className="text-rose-400 ml-0.5">*</span>
                                        )}
                                    </Label>
                                )}

                                {field.type === "textarea" ? (
                                    <textarea
                                        value={String(values[field.id] || "")}
                                        onChange={(e) => setValue(field.id, e.target.value)}
                                        placeholder={field.placeholder || field.label}
                                        className="w-full min-h-[100px] rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[13px] font-medium focus:outline-none focus:border-slate-200 resize-none transition-colors"
                                    />
                                ) : field.type === "select" ? (
                                    <select
                                        value={String(values[field.id] || "")}
                                        onChange={(e) => setValue(field.id, e.target.value)}
                                        className="w-full rounded-xl border border-slate-100 bg-white px-3 py-2.5 text-[13px] font-medium h-10 focus:outline-none focus:border-slate-200 transition-colors"
                                    >
                                        <option value="">Select...</option>
                                        {field.options?.map((opt, i) => (
                                            <option key={i} value={opt}>{opt}</option>
                                        ))}
                                    </select>
                                ) : field.type === "checkbox" ? (
                                    <label className="flex items-center gap-2.5 cursor-pointer">
                                        <input
                                            type="checkbox"
                                            checked={values[field.id] === true}
                                            onChange={(e) => setValue(field.id, e.target.checked)}
                                            className="rounded h-4 w-4"
                                        />
                                        <span className="text-[13px] font-medium text-slate-700">
                                            {field.label}
                                            {field.required && (
                                                <span className="text-rose-400 ml-0.5">*</span>
                                            )}
                                        </span>
                                    </label>
                                ) : (
                                    <Input
                                        type={field.type}
                                        value={String(values[field.id] || "")}
                                        onChange={(e) => setValue(field.id, e.target.value)}
                                        placeholder={field.placeholder || field.label}
                                        className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                    />
                                )}

                                {errors[field.id] && (
                                    <p className="text-[12px] text-rose-500 font-medium flex items-center gap-1">
                                        <AlertCircle className="w-3 h-3" /> {errors[field.id]}
                                    </p>
                                )}
                            </div>
                        ))}

                        {error && (
                            <div className="rounded-xl bg-rose-50 border border-rose-100 p-3">
                                <p className="text-[12px] text-rose-500 font-medium">{error}</p>
                            </div>
                        )}

                        <Button
                            onClick={handleSubmit}
                            disabled={submitting}
                            className="w-full rounded-xl h-11 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                        >
                            {submitting ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Submitting...</>
                            ) : (
                                "Submit"
                            )}
                        </Button>
                    </div>
                </div>

                <p className="text-[11px] text-slate-300 font-medium text-center mt-4">
                    Powered by CareOps
                </p>
            </div>
        </div>
    );
}
