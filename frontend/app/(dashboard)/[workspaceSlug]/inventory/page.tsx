"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    listInventory,
    createInventoryItem,
    updateInventoryItem,
    deleteInventoryItem,
    adjustInventory,
    listInventoryAlerts,
    resolveInventoryAlert,
    getItemHistory,
} from "@/lib/api";
import {
    Plus,
    Minus,
    Package,
    AlertTriangle,
    Trash2,
    Pencil,
    Mail,
    Loader2,
    CheckCircle2,
    AlertCircle,
    ShieldAlert,
    Search,
    Bell,
    History,
    TrendingDown,
    Check,
    ArrowUpRight,
    ArrowDownRight,
    MessageSquare,
} from "lucide-react";

/* ─── Types ──────────────────────────────────────────────────────────────── */

interface InventoryItem {
    id: string;
    name: string;
    sku: string | null;
    quantity: number;
    low_stock_threshold: number;
    unit: string;
    supplier_email: string | null;
    supplier_phone: string | null;
    metadata: Record<string, unknown>;
    created_at: string;
    updated_at: string;
}

interface InventoryAlert {
    id: string;
    item_id: string;
    item_name: string;
    alert_type: string;
    quantity_at_alert: number;
    threshold: number;
    supplier_notified: boolean;
    resolved: boolean;
    resolved_at: string | null;
    created_at: string;
}

interface InventoryAdjustment {
    id: string;
    item_id: string;
    adjustment: number;
    quantity_before: number;
    quantity_after: number;
    reason: string | null;
    created_at: string;
}

type StockStatus = "ok" | "low" | "critical";

function getStatus(qty: number, threshold: number): StockStatus {
    if (qty <= threshold) return "critical";
    if (qty <= threshold * 2) return "low";
    return "ok";
}

const STATUS_CONFIG: Record<
    StockStatus,
    { label: string; color: string; bg: string; border: string; dotColor: string }
> = {
    ok: {
        label: "In Stock",
        color: "text-emerald-600",
        bg: "bg-emerald-50",
        border: "border-emerald-200",
        dotColor: "bg-emerald-500",
    },
    low: {
        label: "Low Stock",
        color: "text-amber-600",
        bg: "bg-amber-50",
        border: "border-amber-200",
        dotColor: "bg-amber-500",
    },
    critical: {
        label: "Critical",
        color: "text-rose-600",
        bg: "bg-rose-50",
        border: "border-rose-200",
        dotColor: "bg-rose-500",
    },
};

const UNITS = ["pcs", "boxes", "bottles", "kg", "liters", "packs", "rolls", "sets", "pairs"];

function timeAgo(iso: string) {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    const weeks = Math.floor(days / 7);
    return `${weeks}w ago`;
}

/* ─── Main Page ──────────────────────────────────────────────────────────── */

export default function InventoryPage() {
    const qc = useQueryClient();
    const [editItem, setEditItem] = useState<InventoryItem | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<InventoryItem | null>(null);
    const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
    const [filter, setFilter] = useState<"all" | "low" | "critical">("all");
    const [searchQuery, setSearchQuery] = useState("");
    const [tab, setTab] = useState("items");

    const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
        queryKey: ["inventory"],
        queryFn: listInventory,
    });

    const { data: alerts = [] } = useQuery<InventoryAlert[]>({
        queryKey: ["inventory-alerts"],
        queryFn: listInventoryAlerts,
    });

    const adjustMut = useMutation({
        mutationFn: (p: { id: string; adj: number }) =>
            adjustInventory(p.id, p.adj, "Quick adjust"),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inventory"] });
            qc.invalidateQueries({ queryKey: ["inventory-alerts"] });
        },
    });

    const deleteMut = useMutation({
        mutationFn: (id: string) => deleteInventoryItem(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ["inventory"] });
            setDeleteTarget(null);
        },
    });

    const resolveMut = useMutation({
        mutationFn: (alertId: string) => resolveInventoryAlert(alertId),
        onSuccess: () => qc.invalidateQueries({ queryKey: ["inventory-alerts"] }),
    });

    // Counts
    const criticalCount = items.filter(
        (i) => getStatus(i.quantity, i.low_stock_threshold) === "critical"
    ).length;
    const lowCount = items.filter(
        (i) => getStatus(i.quantity, i.low_stock_threshold) === "low"
    ).length;
    const okCount = items.filter(
        (i) => getStatus(i.quantity, i.low_stock_threshold) === "ok"
    ).length;
    const unresolvedAlerts = alerts.filter((a) => !a.resolved).length;

    // Filter
    const filteredItems = items
        .filter((item) => {
            if (filter === "low") return getStatus(item.quantity, item.low_stock_threshold) === "low";
            if (filter === "critical") return getStatus(item.quantity, item.low_stock_threshold) === "critical";
            return true;
        })
        .filter((item) => {
            if (!searchQuery) return true;
            return item.name.toLowerCase().includes(searchQuery.toLowerCase());
        });

    return (
        <div className="space-y-6">
            {/* ── Header ── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-display font-bold text-xl tracking-tight text-slate-900">
                        Inventory
                    </h1>
                    <p className="text-[13px] text-slate-400 font-medium mt-1">
                        Track stock levels, set thresholds, and manage suppliers
                    </p>
                </div>
                <ItemFormDialog
                    onSuccess={() => qc.invalidateQueries({ queryKey: ["inventory"] })}
                />
            </div>

            {/* ── Summary Cards ── */}
            {items.length > 0 && (
                <div className="grid grid-cols-3 gap-4">
                    <button
                        onClick={() => setFilter(filter === "all" ? "all" : "all")}
                        className={`rounded-2xl p-5 text-left transition-all duration-200 ${filter === "all"
                            ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                            }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${filter === "all" ? "text-slate-400" : "text-slate-400"}`}>
                                In Stock
                            </span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${filter === "all" ? "bg-white/10" : "bg-slate-50"}`}>
                                <CheckCircle2 className={`w-4 h-4 ${filter === "all" ? "text-emerald-400" : "text-emerald-500"}`} />
                            </div>
                        </div>
                        <span className={`text-3xl font-bold tracking-tight ${filter === "all" ? "text-white" : "text-slate-900"}`}>{okCount}</span>
                    </button>
                    <button
                        onClick={() => setFilter(filter === "low" ? "all" : "low")}
                        className={`rounded-2xl p-5 text-left transition-all duration-200 ${filter === "low"
                            ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                            }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${filter === "low" ? "text-slate-400" : "text-slate-400"}`}>
                                Low Stock
                            </span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${filter === "low" ? "bg-white/10" : "bg-slate-50"}`}>
                                <AlertTriangle className={`w-4 h-4 ${filter === "low" ? "text-amber-400" : "text-amber-500"}`} />
                            </div>
                        </div>
                        <span className={`text-3xl font-bold tracking-tight ${filter === "low" ? "text-white" : "text-slate-900"}`}>{lowCount}</span>
                    </button>
                    <button
                        onClick={() => setFilter(filter === "critical" ? "all" : "critical")}
                        className={`rounded-2xl p-5 text-left transition-all duration-200 ${filter === "critical"
                            ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10"
                            : "bg-white border border-slate-200/80 hover:border-slate-300 hover:shadow-sm"
                            }`}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className={`text-[11px] font-semibold uppercase tracking-wider ${filter === "critical" ? "text-slate-400" : "text-slate-400"}`}>
                                Critical
                            </span>
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${filter === "critical" ? "bg-white/10" : "bg-slate-50"}`}>
                                <ShieldAlert className={`w-4 h-4 ${filter === "critical" ? "text-rose-400" : "text-rose-500"}`} />
                            </div>
                        </div>
                        <span className={`text-3xl font-bold tracking-tight ${filter === "critical" ? "text-white" : "text-slate-900"}`}>{criticalCount}</span>
                    </button>
                </div>
            )}

            {/* ── Critical Alert Banner ── */}
            {criticalCount > 0 && filter === "all" && (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-rose-50 border border-rose-100">
                    <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                    <p className="text-[13px] font-semibold text-rose-600">
                        {criticalCount} {criticalCount === 1 ? "item is" : "items are"} critically low
                    </p>
                    <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl h-7 text-[11px] font-semibold border-rose-200 text-rose-600 hover:bg-rose-100 ml-auto"
                        onClick={() => setFilter("critical")}
                    >
                        View Items
                    </Button>
                </div>
            )}

            {/* ── Tabs: Items & Alerts ── */}
            <Tabs value={tab} onValueChange={setTab} className="w-full">
                <TabsList className="bg-slate-100/50 rounded-xl h-11 p-1 border border-slate-100">
                    <TabsTrigger
                        value="items"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <Package className="w-3.5 h-3.5 mr-2" /> Items ({items.length})
                    </TabsTrigger>
                    <TabsTrigger
                        value="alerts"
                        className="rounded-lg text-[13px] font-semibold data-[state=active]:bg-white data-[state=active]:shadow-sm"
                    >
                        <Bell className="w-3.5 h-3.5 mr-2" /> Alerts
                        {unresolvedAlerts > 0 && (
                            <Badge className="ml-1.5 rounded-full px-1.5 py-0 text-[10px] bg-rose-500 text-white border-0">
                                {unresolvedAlerts}
                            </Badge>
                        )}
                    </TabsTrigger>
                </TabsList>

                {/* ── Items Tab ── */}
                <TabsContent value="items" className="mt-6 space-y-4">
                    {/* Search */}
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-300" />
                        <Input
                            placeholder="Search items..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="rounded-xl h-10 pl-9 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                        />
                    </div>

                    {/* Active filter badge */}
                    {filter !== "all" && (
                        <div className="flex items-center gap-2">
                            <Badge
                                variant="outline"
                                className={`rounded-full text-[11px] font-semibold px-3 py-1 ${filter === "low"
                                    ? "bg-amber-50 text-amber-600 border-amber-200"
                                    : "bg-rose-50 text-rose-600 border-rose-200"
                                    }`}
                            >
                                Showing: {filter === "low" ? "Low Stock" : "Critical"} ({filteredItems.length})
                            </Badge>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="rounded-xl h-7 text-[11px] font-medium text-slate-400 hover:text-slate-600"
                                onClick={() => setFilter("all")}
                            >
                                Show All
                            </Button>
                        </div>
                    )}

                    {/* Items Table */}
                    <Card className="rounded-2xl border-slate-100 shadow-sm overflow-hidden">
                        <CardContent className="p-0">
                            <div className="grid grid-cols-[1fr_80px_110px_80px_100px_90px_90px] gap-0 bg-slate-50 border-b border-slate-100 px-1">
                                {["Item", "SKU", "Quantity", "Unit", "Threshold", "Supplier", "Status"].map(
                                    (h) => (
                                        <div
                                            key={h}
                                            className="px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wider"
                                        >
                                            {h}
                                        </div>
                                    )
                                )}
                            </div>

                            <ScrollArea className="h-[500px]">
                                {isLoading ? (
                                    <div className="flex items-center justify-center py-20 gap-2">
                                        <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
                                        <span className="text-[13px] text-slate-300 font-medium">Loading inventory...</span>
                                    </div>
                                ) : filteredItems.length === 0 ? (
                                    <div className="text-center py-16">
                                        <Package className="w-10 h-10 mx-auto text-slate-200 mb-4" />
                                        <p className="text-[15px] font-semibold text-slate-400">
                                            {items.length === 0 ? "No items yet" : "No items match your filter"}
                                        </p>
                                        <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                                            {items.length === 0
                                                ? "Add your first item to start tracking stock levels."
                                                : "Try adjusting your search or filter."}
                                        </p>
                                    </div>
                                ) : (
                                    filteredItems.map((item) => {
                                        const st = getStatus(item.quantity, item.low_stock_threshold);
                                        const cfg = STATUS_CONFIG[st];
                                        return (
                                            <div
                                                key={item.id}
                                                className="grid grid-cols-[1fr_80px_110px_80px_100px_90px_90px] gap-0 border-b border-slate-50 hover:bg-slate-50/50 transition-colors group px-1 cursor-pointer"
                                                onClick={() => setDetailItem(item)}
                                            >
                                                <div className="px-3 py-3 flex items-center gap-2 min-w-0">
                                                    <span className="text-[13px] font-semibold text-slate-900 truncate">
                                                        {item.name}
                                                    </span>
                                                    <div className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => setEditItem(item)}
                                                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                                                        >
                                                            <Pencil className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => setDeleteTarget(item)}
                                                            className="p-1 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-500 transition-colors"
                                                        >
                                                            <Trash2 className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                </div>
                                                <div className="px-3 py-3 text-[12px] text-slate-400 font-medium flex items-center">
                                                    {item.sku || "—"}
                                                </div>
                                                <div className="px-2 py-2 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                                    <button
                                                        className="w-7 h-7 rounded-lg border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors disabled:opacity-30 text-slate-400 hover:text-slate-600"
                                                        disabled={adjustMut.isPending}
                                                        onClick={() => adjustMut.mutate({ id: item.id, adj: -1 })}
                                                    >
                                                        <Minus className="w-3 h-3" />
                                                    </button>
                                                    <span className="text-[13px] font-bold text-slate-900 flex-1 text-center tabular-nums">
                                                        {item.quantity}
                                                    </span>
                                                    <button
                                                        className="w-7 h-7 rounded-lg border border-slate-100 flex items-center justify-center hover:bg-slate-50 transition-colors disabled:opacity-30 text-slate-400 hover:text-slate-600"
                                                        disabled={adjustMut.isPending}
                                                        onClick={() => adjustMut.mutate({ id: item.id, adj: 1 })}
                                                    >
                                                        <Plus className="w-3 h-3" />
                                                    </button>
                                                </div>
                                                <div className="px-3 py-3 text-[12px] text-slate-400 font-medium flex items-center capitalize">
                                                    {item.unit}
                                                </div>
                                                <div className="px-3 py-3 flex items-center gap-1.5">
                                                    {st !== "ok" && <AlertTriangle className={`w-3.5 h-3.5 ${cfg.color}`} />}
                                                    <span className="text-[12px] text-slate-400 font-medium">≤ {item.low_stock_threshold}</span>
                                                </div>
                                                <div className="px-3 py-3 flex items-center gap-1.5 min-w-0">
                                                    {item.supplier_email && (
                                                        <span className="text-[11px] text-blue-500 font-medium truncate flex items-center gap-1" title={item.supplier_email}>
                                                            <Mail className="w-3 h-3 shrink-0" />
                                                        </span>
                                                    )}
                                                    {item.supplier_phone && (
                                                        <span className="text-[11px] text-emerald-500 font-medium truncate flex items-center gap-1" title={item.supplier_phone}>
                                                            <MessageSquare className="w-3 h-3 shrink-0" />
                                                        </span>
                                                    )}
                                                    {!item.supplier_email && !item.supplier_phone && (
                                                        <span className="text-[11px] text-slate-300 font-medium">None</span>
                                                    )}
                                                </div>
                                                <div className="px-3 py-3 flex items-center">
                                                    <Badge
                                                        variant="outline"
                                                        className={`rounded-full text-[10px] font-semibold px-2.5 ${cfg.color} ${cfg.bg} ${cfg.border} border`}
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dotColor} mr-1.5`} />
                                                        {cfg.label}
                                                    </Badge>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </ScrollArea>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* ── Alerts Tab ── */}
                <TabsContent value="alerts" className="mt-6 space-y-4">
                    {alerts.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 p-12 text-center">
                            <Bell className="w-10 h-10 text-slate-200 mx-auto mb-4" />
                            <p className="text-[15px] font-semibold text-slate-400">
                                No alerts yet
                            </p>
                            <p className="text-[13px] text-slate-300 mt-1.5 max-w-xs mx-auto">
                                Alerts will appear here when items drop below their stock threshold.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {alerts.map((alert) => (
                                <div
                                    key={alert.id}
                                    className={`flex items-center gap-4 px-4 py-3.5 rounded-xl border transition-all ${alert.resolved
                                        ? "bg-white border-slate-100 opacity-60"
                                        : alert.alert_type === "out_of_stock"
                                            ? "bg-rose-50 border-rose-100"
                                            : "bg-amber-50 border-amber-100"
                                        }`}
                                >
                                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${alert.resolved
                                        ? "bg-slate-100"
                                        : alert.alert_type === "out_of_stock"
                                            ? "bg-rose-100"
                                            : "bg-amber-100"
                                        }`}>
                                        {alert.resolved ? (
                                            <Check className="w-4 h-4 text-slate-400" />
                                        ) : alert.alert_type === "out_of_stock" ? (
                                            <ShieldAlert className="w-4 h-4 text-rose-500" />
                                        ) : (
                                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-[13px] font-semibold text-slate-900">
                                            {alert.item_name}{" "}
                                            <span className="font-normal text-slate-500">
                                                {alert.alert_type === "out_of_stock"
                                                    ? "reached zero"
                                                    : `dropped below threshold of ${alert.threshold}`}
                                            </span>
                                        </p>
                                        <div className="flex items-center gap-3 mt-0.5">
                                            <span className="text-[11px] text-slate-400 font-medium">
                                                {alert.quantity_at_alert} {items.find(i => i.id === alert.item_id)?.unit || "units"} remaining
                                            </span>
                                            {alert.supplier_notified && (
                                                <span className="text-[11px] text-blue-500 font-medium flex items-center gap-1">
                                                    <Mail className="w-3 h-3" /> Supplier notified
                                                </span>
                                            )}
                                            <span className="text-[11px] text-slate-300 font-medium">
                                                {timeAgo(alert.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    {!alert.resolved && (
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            className="rounded-xl h-8 text-[11px] font-semibold border-slate-200 text-slate-500 hover:text-slate-900 shrink-0"
                                            onClick={() => resolveMut.mutate(alert.id)}
                                            disabled={resolveMut.isPending}
                                        >
                                            {resolveMut.isPending ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            ) : (
                                                <>
                                                    <Check className="w-3 h-3 mr-1" /> Resolve
                                                </>
                                            )}
                                        </Button>
                                    )}
                                    {alert.resolved && (
                                        <Badge variant="outline" className="rounded-full text-[10px] font-semibold px-2.5 bg-slate-50 text-slate-400 border-slate-200 shrink-0">
                                            Resolved
                                        </Badge>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </TabsContent>
            </Tabs>

            {/* ── Item Detail / Usage History Dialog ── */}
            <ItemDetailDialog
                item={detailItem}
                open={!!detailItem}
                onOpenChange={(o) => !o && setDetailItem(null)}
            />

            {/* ── Edit Dialog ── */}
            {editItem && (
                <ItemFormDialog
                    item={editItem}
                    onSuccess={() => {
                        qc.invalidateQueries({ queryKey: ["inventory"] });
                        setEditItem(null);
                    }}
                    open
                    onOpenChange={(o) => !o && setEditItem(null)}
                />
            )}

            {/* ── Delete Confirmation ── */}
            <Dialog
                open={!!deleteTarget}
                onOpenChange={(o) => !o && setDeleteTarget(null)}
            >
                <DialogContent className="sm:max-w-[400px] rounded-2xl border-slate-100">
                    <DialogHeader>
                        <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                            Delete Item
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-[13px] text-slate-500 font-medium">
                        Are you sure you want to remove{" "}
                        <span className="text-slate-900 font-semibold">{deleteTarget?.name}</span>{" "}
                        from inventory? This action cannot be undone.
                    </p>
                    <DialogFooter className="gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-medium border-slate-200 text-slate-500"
                            onClick={() => setDeleteTarget(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            className="rounded-xl h-9 text-[13px] font-semibold"
                            disabled={deleteMut.isPending}
                            onClick={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
                        >
                            {deleteMut.isPending ? (
                                <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Deleting...</>
                            ) : (
                                "Delete"
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

/* ─── Item Detail / Usage History Dialog ─────────────────────────────────── */

function ItemDetailDialog({
    item,
    open,
    onOpenChange,
}: {
    item: InventoryItem | null;
    open: boolean;
    onOpenChange: (o: boolean) => void;
}) {
    const { data: history = [], isLoading } = useQuery<InventoryAdjustment[]>({
        queryKey: ["inventory-history", item?.id],
        queryFn: () => getItemHistory(item!.id),
        enabled: !!item,
    });

    if (!item) return null;

    const st = getStatus(item.quantity, item.low_stock_threshold);
    const cfg = STATUS_CONFIG[st];

    // Compute simple usage stats
    const now = Date.now();
    const oneWeekAgo = now - 7 * 24 * 60 * 60 * 1000;
    const twoWeeksAgo = now - 14 * 24 * 60 * 60 * 1000;

    const deductions = history.filter((h) => h.adjustment < 0);
    const thisWeek = deductions
        .filter((h) => new Date(h.created_at).getTime() >= oneWeekAgo)
        .reduce((sum, h) => sum + Math.abs(h.adjustment), 0);
    const lastWeek = deductions
        .filter((h) => {
            const t = new Date(h.created_at).getTime();
            return t >= twoWeeksAgo && t < oneWeekAgo;
        })
        .reduce((sum, h) => sum + Math.abs(h.adjustment), 0);
    const avgPerWeek = deductions.length > 0
        ? Math.round(
            deductions.reduce((sum, h) => sum + Math.abs(h.adjustment), 0) /
            Math.max(1, Math.ceil((now - new Date(deductions[deductions.length - 1]?.created_at).getTime()) / (7 * 24 * 60 * 60 * 1000)))
        )
        : 0;

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[520px] rounded-2xl border-slate-100 max-h-[85vh] overflow-hidden flex flex-col">
                <DialogHeader>
                    <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900 flex items-center gap-2">
                        {item.name}
                        <Badge
                            variant="outline"
                            className={`rounded-full text-[10px] font-semibold px-2.5 ${cfg.color} ${cfg.bg} ${cfg.border} border`}
                        >
                            {cfg.label}
                        </Badge>
                    </DialogTitle>
                </DialogHeader>

                <div className="space-y-5 overflow-y-auto flex-1 pr-1">
                    {/* Current Stock */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                            <p className="text-xl font-bold text-slate-900 tabular-nums">{item.quantity}</p>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                                Current ({item.unit})
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center">
                            <p className="text-xl font-bold text-slate-900 tabular-nums">{item.low_stock_threshold}</p>
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">
                                Threshold
                            </p>
                        </div>
                        <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-center flex flex-col justify-center gap-1">
                            {item.supplier_email || item.supplier_phone ? (
                                <div className="flex flex-col gap-1.5">
                                    {item.supplier_email && (
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-blue-500 truncate" title={item.supplier_email}>
                                            <Mail className="w-3.5 h-3.5 shrink-0" /> {item.supplier_email.split("@")[0]}
                                        </div>
                                    )}
                                    {item.supplier_phone && (
                                        <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-500 truncate" title={item.supplier_phone}>
                                            <MessageSquare className="w-3.5 h-3.5 shrink-0" /> {item.supplier_phone}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <>
                                    <Mail className="w-5 h-5 text-slate-300 mx-auto" />
                                    <p className="text-[10px] font-semibold text-slate-300 mt-1">No supplier</p>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Usage Summary */}
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <TrendingDown className="w-3.5 h-3.5" /> Usage Summary
                        </p>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="rounded-xl border border-slate-100 p-3 text-center">
                                <p className="text-lg font-bold text-slate-900 tabular-nums">{thisWeek}</p>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">This Week</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 p-3 text-center">
                                <p className="text-lg font-bold text-slate-900 tabular-nums">{lastWeek}</p>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Last Week</p>
                            </div>
                            <div className="rounded-xl border border-slate-100 p-3 text-center">
                                <p className="text-lg font-bold text-slate-900 tabular-nums">~{avgPerWeek}</p>
                                <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Avg / Week</p>
                            </div>
                        </div>
                    </div>

                    {/* Adjustment History */}
                    <div>
                        <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                            <History className="w-3.5 h-3.5" /> Recent Activity
                        </p>
                        {isLoading ? (
                            <div className="flex items-center justify-center py-8 gap-2">
                                <Loader2 className="w-4 h-4 animate-spin text-slate-300" />
                                <span className="text-[12px] text-slate-300 font-medium">Loading history...</span>
                            </div>
                        ) : history.length === 0 ? (
                            <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center">
                                <p className="text-[13px] text-slate-300 font-medium">No activity recorded yet</p>
                            </div>
                        ) : (
                            <ScrollArea className="h-[200px]">
                                <div className="space-y-1.5">
                                    {history.slice(0, 30).map((adj) => (
                                        <div key={adj.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
                                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${adj.adjustment > 0 ? "bg-emerald-50" : "bg-rose-50"
                                                }`}>
                                                {adj.adjustment > 0 ? (
                                                    <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
                                                ) : (
                                                    <ArrowDownRight className="w-3.5 h-3.5 text-rose-500" />
                                                )}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-[12px] font-semibold text-slate-700">
                                                    {adj.adjustment > 0 ? "+" : ""}{adj.adjustment} {item.unit}
                                                    <span className="font-normal text-slate-400 ml-1.5">
                                                        ({adj.quantity_before} → {adj.quantity_after})
                                                    </span>
                                                </p>
                                                {adj.reason && (
                                                    <p className="text-[11px] text-slate-400 truncate">{adj.reason}</p>
                                                )}
                                            </div>
                                            <span className="text-[11px] text-slate-300 font-medium shrink-0">
                                                {timeAgo(adj.created_at)}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

/* ─── Item Form Dialog (Create / Edit) ───────────────────────────────────── */

function ItemFormDialog({
    item,
    onSuccess,
    open: controlledOpen,
    onOpenChange: controlledOnOpenChange,
}: {
    item?: InventoryItem;
    onSuccess: () => void;
    open?: boolean;
    onOpenChange?: (o: boolean) => void;
}) {
    const isEdit = !!item;
    const [internalOpen, setInternalOpen] = useState(false);
    const open = controlledOpen ?? internalOpen;
    const setOpen = controlledOnOpenChange ?? setInternalOpen;

    const [name, setName] = useState(item?.name || "");
    const [sku, setSku] = useState(item?.sku || "");
    const [quantity, setQuantity] = useState(item?.quantity ?? 0);
    const [unit, setUnit] = useState(item?.unit || "pcs");
    const [threshold, setThreshold] = useState(item?.low_stock_threshold ?? 5);
    const [supplierEmail, setSupplierEmail] = useState(item?.supplier_email || "");
    const [supplierPhone, setSupplierPhone] = useState(item?.supplier_phone || "");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setSubmitting(true);

        try {
            if (isEdit && item) {
                await updateInventoryItem(item.id, {
                    name,
                    sku: sku || null,
                    quantity,
                    unit,
                    low_stock_threshold: threshold,
                    supplier_email: supplierEmail || null,
                    supplier_phone: supplierPhone || null,
                });
            } else {
                await createInventoryItem({
                    name,
                    sku: sku || undefined,
                    quantity,
                    unit,
                    low_stock_threshold: threshold,
                    supplier_email: supplierEmail || undefined,
                    supplier_phone: supplierPhone || undefined,
                });
            }
            onSuccess();
            if (!isEdit) {
                setName("");
                setSku("");
                setQuantity(0);
                setUnit("pcs");
                setThreshold(5);
                setSupplierEmail("");
                setSupplierPhone("");
            }
            setOpen(false);
        } catch (err) {
            console.error("Failed to save item:", err);
        } finally {
            setSubmitting(false);
        }
    }

    const trigger = !isEdit ? (
        <DialogTrigger asChild>
            <Button
                size="sm"
                className="rounded-xl h-9 font-semibold text-[13px] gap-2 bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
            >
                <Plus className="w-3.5 h-3.5" /> Add Item
            </Button>
        </DialogTrigger>
    ) : null;

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            {trigger}
            <DialogContent className="sm:max-w-[480px] rounded-2xl border-slate-100">
                <DialogHeader>
                    <DialogTitle className="font-display font-bold text-lg tracking-tight text-slate-900">
                        {isEdit ? "Edit Item" : "Add New Item"}
                    </DialogTitle>
                </DialogHeader>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                        <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Item Name <span className="text-rose-400">*</span>
                        </Label>
                        <Input
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. Latex Gloves"
                            className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            required
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">SKU</Label>
                            <Input
                                value={sku}
                                onChange={(e) => setSku(e.target.value)}
                                placeholder="Optional"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Unit</Label>
                            <Select value={unit} onValueChange={setUnit}>
                                <SelectTrigger className="rounded-xl border-slate-100 text-[13px] font-medium h-10">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="rounded-xl border-slate-100">
                                    {UNITS.map((u) => (
                                        <SelectItem key={u} value={u} className="text-[13px] font-medium capitalize">
                                            {u}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Current Quantity</Label>
                            <Input
                                type="number"
                                min={0}
                                value={quantity}
                                onChange={(e) => setQuantity(parseInt(e.target.value) || 0)}
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Low Stock Alert</Label>
                            <Input
                                type="number"
                                min={0}
                                value={threshold}
                                onChange={(e) => setThreshold(parseInt(e.target.value) || 0)}
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <Mail className="w-3 h-3" /> Supplier Email
                            </Label>
                            <Input
                                type="email"
                                value={supplierEmail}
                                onChange={(e) => setSupplierEmail(e.target.value)}
                                placeholder="vendor@supplier.com"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                <MessageSquare className="w-3 h-3" /> Supplier WhatsApp
                            </Label>
                            <Input
                                value={supplierPhone}
                                onChange={(e) => setSupplierPhone(e.target.value)}
                                placeholder="+91 99999 99999"
                                className="rounded-xl h-10 text-[13px] font-medium border-slate-100 focus-visible:ring-0 focus:border-slate-200"
                            />
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium">
                        Auto-notified (Email & WhatsApp) when stock drops below threshold
                    </p>

                    <Button
                        type="submit"
                        className="w-full rounded-xl h-11 text-[13px] font-semibold bg-slate-900 hover:bg-slate-800 text-white shadow-md shadow-slate-200"
                        disabled={submitting || !name}
                    >
                        {submitting ? (
                            <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Saving...</>
                        ) : isEdit ? (
                            "Update Item"
                        ) : (
                            "Add Item"
                        )}
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
