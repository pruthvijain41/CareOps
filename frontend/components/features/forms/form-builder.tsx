"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
    Plus,
    Trash2,
    GripVertical,
    ChevronUp,
    ChevronDown,
    Type,
    Mail,
    Phone,
    AlignLeft,
    List,
    CheckSquare,
    Calendar,
    Hash,
    Loader2,
    Eye,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface FormField {
    id: string;
    type: "text" | "email" | "phone" | "textarea" | "select" | "checkbox" | "date" | "number";
    label: string;
    required: boolean;
    placeholder?: string;
    options?: string[]; // for select fields
}

export interface FormSchema {
    fields: FormField[];
}

interface FormBuilderProps {
    initialTitle?: string;
    initialDescription?: string;
    initialSchema?: FormSchema;
    onSave: (title: string, description: string, schema: FormSchema) => void;
    onCancel: () => void;
    saving?: boolean;
}

const FIELD_TYPES = [
    { value: "text", label: "Text", icon: Type },
    { value: "email", label: "Email", icon: Mail },
    { value: "phone", label: "Phone", icon: Phone },
    { value: "textarea", label: "Long Text", icon: AlignLeft },
    { value: "select", label: "Dropdown", icon: List },
    { value: "checkbox", label: "Checkbox", icon: CheckSquare },
    { value: "date", label: "Date", icon: Calendar },
    { value: "number", label: "Number", icon: Hash },
] as const;

// ── Component ────────────────────────────────────────────────────────────────

export default function FormBuilder({
    initialTitle = "",
    initialDescription = "",
    initialSchema,
    onSave,
    onCancel,
    saving = false,
}: FormBuilderProps) {
    const [title, setTitle] = useState(initialTitle);
    const [description, setDescription] = useState(initialDescription);
    const [fields, setFields] = useState<FormField[]>(
        initialSchema?.fields || []
    );

    function generateId() {
        return `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    }

    function addField(type: FormField["type"]) {
        const label =
            type === "email" ? "Email Address" :
                type === "phone" ? "Phone Number" :
                    type === "date" ? "Date" :
                        type === "number" ? "Number" :
                            type === "textarea" ? "Details" :
                                type === "select" ? "Choose One" :
                                    type === "checkbox" ? "I agree" :
                                        "Field";

        const newField: FormField = {
            id: generateId(),
            type,
            label,
            required: type === "email",
            placeholder: "",
            ...(type === "select" ? { options: ["Option 1", "Option 2"] } : {}),
        };
        setFields([...fields, newField]);
    }

    function updateField(index: number, updates: Partial<FormField>) {
        setFields((prev) =>
            prev.map((f, i) => (i === index ? { ...f, ...updates } : f))
        );
    }

    function removeField(index: number) {
        setFields((prev) => prev.filter((_, i) => i !== index));
    }

    function moveField(index: number, direction: "up" | "down") {
        const newFields = [...fields];
        const swapIndex = direction === "up" ? index - 1 : index + 1;
        if (swapIndex < 0 || swapIndex >= newFields.length) return;
        [newFields[index], newFields[swapIndex]] = [newFields[swapIndex], newFields[index]];
        setFields(newFields);
    }

    function addOption(fieldIndex: number) {
        const field = fields[fieldIndex];
        if (field.type === "select" && field.options) {
            updateField(fieldIndex, {
                options: [...field.options, `Option ${field.options.length + 1}`],
            });
        }
    }

    function updateOption(fieldIndex: number, optIndex: number, value: string) {
        const field = fields[fieldIndex];
        if (field.options) {
            const newOptions = [...field.options];
            newOptions[optIndex] = value;
            updateField(fieldIndex, { options: newOptions });
        }
    }

    function removeOption(fieldIndex: number, optIndex: number) {
        const field = fields[fieldIndex];
        if (field.options && field.options.length > 1) {
            updateField(fieldIndex, {
                options: field.options.filter((_, i) => i !== optIndex),
            });
        }
    }

    function handleSave() {
        if (!title.trim()) return;
        onSave(title.trim(), description.trim(), { fields });
    }

    const fieldTypeIcon = (type: string) => {
        const ft = FIELD_TYPES.find(f => f.value === type);
        return ft ? ft.icon : Type;
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* ── Builder Panel ──────────────────────────────────────── */}
            <div className="space-y-4">
                {/* Form Settings */}
                <Card className="rounded-2xl border-slate-100 shadow-sm">
                    <CardContent className="p-5 space-y-4">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Form Details</p>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500">Title</Label>
                            <Input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="e.g. Patient Intake Form"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-500">Description</Label>
                            <Input
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Please complete this form before your visit"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Field Type Buttons */}
                <Card className="rounded-2xl border-slate-100 shadow-sm">
                    <CardContent className="p-5 space-y-3">
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Add a Field</p>
                        <div className="flex flex-wrap gap-1.5">
                            {FIELD_TYPES.map((ft) => {
                                const Icon = ft.icon;
                                return (
                                    <Button
                                        key={ft.value}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => addField(ft.value as FormField["type"])}
                                        className="rounded-xl h-8 text-[12px] font-medium border-slate-100 text-slate-500 hover:text-slate-900 hover:bg-slate-50 gap-1.5"
                                    >
                                        <Icon className="w-3.5 h-3.5" /> {ft.label}
                                    </Button>
                                );
                            })}
                        </div>
                    </CardContent>
                </Card>

                {/* Fields List */}
                {fields.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 p-10 text-center">
                        <p className="text-[13px] font-medium text-slate-400">
                            No fields added yet
                        </p>
                        <p className="text-[12px] text-slate-300 mt-1">
                            Click a field type above to add questions to your form.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {fields.map((field, index) => {
                            const Icon = fieldTypeIcon(field.type);
                            return (
                                <Card key={field.id} className="rounded-2xl border-slate-100 shadow-sm">
                                    <CardContent className="p-0">
                                        {/* Field header */}
                                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-50 bg-slate-50/50 rounded-t-2xl">
                                            <div className="flex items-center gap-2">
                                                <GripVertical className="w-3.5 h-3.5 text-slate-300" />
                                                <Badge
                                                    variant="outline"
                                                    className="rounded-full text-[10px] font-semibold px-2 bg-white border-slate-100 text-slate-500 gap-1"
                                                >
                                                    <Icon className="w-3 h-3" /> {FIELD_TYPES.find(f => f.value === field.type)?.label}
                                                </Badge>
                                                <span className="text-[11px] text-slate-300 font-medium">
                                                    #{index + 1}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-0.5">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => moveField(index, "up")}
                                                    disabled={index === 0}
                                                    className="h-7 w-7 p-0 rounded-lg text-slate-400 hover:text-slate-600"
                                                >
                                                    <ChevronUp className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => moveField(index, "down")}
                                                    disabled={index === fields.length - 1}
                                                    className="h-7 w-7 p-0 rounded-lg text-slate-400 hover:text-slate-600"
                                                >
                                                    <ChevronDown className="w-3.5 h-3.5" />
                                                </Button>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => removeField(index)}
                                                    className="h-7 w-7 p-0 rounded-lg text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </Button>
                                            </div>
                                        </div>
                                        {/* Field config */}
                                        <div className="p-4 space-y-3">
                                            <div className="grid grid-cols-2 gap-3">
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                        Label
                                                    </Label>
                                                    <Input
                                                        value={field.label}
                                                        onChange={(e) =>
                                                            updateField(index, { label: e.target.value })
                                                        }
                                                        className="rounded-xl h-9 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                                    />
                                                </div>
                                                <div className="space-y-1.5">
                                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                        Placeholder
                                                    </Label>
                                                    <Input
                                                        value={field.placeholder || ""}
                                                        onChange={(e) =>
                                                            updateField(index, { placeholder: e.target.value })
                                                        }
                                                        className="rounded-xl h-9 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                                                    />
                                                </div>
                                            </div>
                                            <div className="flex items-center gap-2.5">
                                                <Switch
                                                    checked={field.required}
                                                    onCheckedChange={(checked) =>
                                                        updateField(index, { required: checked })
                                                    }
                                                />
                                                <Label className="text-[12px] font-medium text-slate-500">
                                                    Required
                                                </Label>
                                            </div>
                                            {/* Select options */}
                                            {field.type === "select" && field.options && (
                                                <div className="space-y-2 pt-1">
                                                    <Label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                                        Options
                                                    </Label>
                                                    {field.options.map((opt, optIdx) => (
                                                        <div key={optIdx} className="flex items-center gap-1.5">
                                                            <Input
                                                                value={opt}
                                                                onChange={(e) =>
                                                                    updateOption(index, optIdx, e.target.value)
                                                                }
                                                                className="rounded-xl h-8 text-[12px] font-medium border-slate-100 focus-visible:ring-0 flex-1"
                                                            />
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => removeOption(index, optIdx)}
                                                                className="h-8 w-8 p-0 rounded-lg text-rose-400 hover:text-rose-500 hover:bg-rose-50"
                                                            >
                                                                <Trash2 className="w-3 h-3" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={() => addOption(index)}
                                                        className="rounded-xl h-8 text-[12px] font-medium border-slate-100 text-slate-500 hover:text-slate-900 gap-1.5"
                                                    >
                                                        <Plus className="w-3 h-3" /> Add Option
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            );
                        })}
                    </div>
                )}

                {/* Save / Cancel */}
                <div className="flex items-center gap-2 pt-2">
                    <Button
                        onClick={handleSave}
                        disabled={!title.trim() || saving}
                        className="rounded-xl h-10 text-[13px] font-semibold px-6 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                    >
                        {saving ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving...</>
                        ) : (
                            "Save Form"
                        )}
                    </Button>
                    <Button
                        variant="outline"
                        onClick={onCancel}
                        className="rounded-xl h-10 text-[13px] font-medium px-6 border-slate-200 text-slate-500"
                    >
                        Cancel
                    </Button>
                </div>
            </div>

            {/* ── Live Preview ────────────────────────────────────── */}
            <Card className="rounded-2xl border-slate-100 shadow-sm sticky top-4 self-start">
                <CardContent className="p-0">
                    <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl flex items-center gap-2">
                        <Eye className="w-4 h-4 text-slate-400" />
                        <span className="text-[12px] font-semibold text-slate-400">
                            Live Preview
                        </span>
                    </div>
                    <div className="p-5 space-y-4">
                        {title ? (
                            <h2 className="font-display font-bold text-lg tracking-tight text-slate-900">
                                {title}
                            </h2>
                        ) : (
                            <p className="text-[13px] text-slate-300 font-medium">
                                Untitled Form
                            </p>
                        )}
                        {description && (
                            <p className="text-[13px] text-slate-500 font-medium -mt-1">
                                {description}
                            </p>
                        )}
                        <div className="h-px bg-slate-100" />
                        {fields.length === 0 ? (
                            <p className="text-[13px] text-slate-300 font-medium text-center py-8">
                                Add fields to see a preview
                            </p>
                        ) : (
                            <div className="space-y-4">
                                {fields.map((field) => (
                                    <div key={field.id} className="space-y-2">
                                        <Label className="text-[12px] font-semibold text-slate-600">
                                            {field.label}
                                            {field.required && (
                                                <span className="text-rose-400 ml-0.5">*</span>
                                            )}
                                        </Label>
                                        {field.type === "textarea" ? (
                                            <textarea
                                                disabled
                                                placeholder={field.placeholder || field.label}
                                                className="w-full min-h-[80px] rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[13px] resize-none opacity-60"
                                            />
                                        ) : field.type === "select" ? (
                                            <select
                                                disabled
                                                className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5 text-[13px] h-10 opacity-60"
                                            >
                                                <option>Select...</option>
                                                {field.options?.map((opt, i) => (
                                                    <option key={i}>{opt}</option>
                                                ))}
                                            </select>
                                        ) : field.type === "checkbox" ? (
                                            <div className="flex items-center gap-2.5">
                                                <input
                                                    type="checkbox"
                                                    disabled
                                                    className="rounded"
                                                />
                                                <span className="text-[13px] text-slate-500 opacity-60">
                                                    {field.label}
                                                </span>
                                            </div>
                                        ) : (
                                            <Input
                                                disabled
                                                type={field.type}
                                                placeholder={field.placeholder || field.label}
                                                className="rounded-xl border-slate-100 bg-slate-50 text-[13px] h-10 opacity-60"
                                            />
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                        <Button
                            disabled
                            className="w-full rounded-xl h-10 text-[13px] font-semibold bg-slate-900 text-white opacity-50 mt-4"
                        >
                            Submit
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
