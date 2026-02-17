"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listConversations, syncGmail } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Search, Mail, MessageCircle, Inbox, MessageSquare, RefreshCw } from "lucide-react";

interface Conversation {
    id: string;
    subject: string;
    channel: "gmail" | "telegram" | "whatsapp" | "internal";
    last_message_at: string;
    is_archived: boolean;
    is_read: boolean;
}

interface ThreadListProps {
    onSelect: (id: string) => void;
    activeId?: string;
}

const FILTER_TABS = ["All", "Unread", "Archived"] as const;

export function ThreadList({ onSelect, activeId }: ThreadListProps) {
    const params = useParams<{ workspaceSlug: string }>();
    const [activeFilter, setActiveFilter] = useState<string>("All");
    const [searchQuery, setSearchQuery] = useState("");
    const [isSyncing, setIsSyncing] = useState(false);
    const queryClient = useQueryClient();

    const { data: threads, isLoading } = useQuery<Conversation[]>({
        queryKey: ["conversations", params.workspaceSlug],
        queryFn: listConversations,
        refetchInterval: 15000,
    });

    // Sync Gmail on mount and provide manual sync
    const handleSync = useCallback(async () => {
        setIsSyncing(true);
        try {
            const result = await syncGmail();
            if (result.synced > 0) {
                queryClient.invalidateQueries({ queryKey: ["conversations"] });
            }
        } catch (err) {
            // Gmail may not be connected — silently ignore
        } finally {
            setIsSyncing(false);
        }
    }, [queryClient]);

    useEffect(() => {
        handleSync();
    }, [handleSync]);

    // Count unread for badge
    const unreadCount = threads?.filter(t => !t.is_read && !t.is_archived).length ?? 0;

    // Filter threads based on active filter and search
    const filteredThreads = threads?.filter((thread) => {
        // Search filter
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!thread.subject?.toLowerCase().includes(q)) return false;
        }
        // Tab filter
        if (activeFilter === "Archived") return thread.is_archived;
        if (activeFilter === "Unread") return !thread.is_read && !thread.is_archived;
        return true;
    });

    if (isLoading) {
        return (
            <div className="p-6 space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-16 bg-slate-100/50 rounded-xl" />
                ))}
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="px-5 pt-5 pb-3">
                <div className="flex items-center justify-between mb-4">
                    <h2 className="font-display font-bold text-base tracking-tight text-slate-900">
                        Inbox
                    </h2>
                    <span className="text-[11px] font-semibold text-slate-400 bg-white px-2.5 py-1 rounded-full border border-slate-100">
                        {threads?.length ?? 0} conversations
                    </span>
                </div>

                {/* Search */}
                <div className="relative group">
                    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-300 group-focus-within:text-slate-500 transition-colors" />
                    <Input
                        placeholder="Search conversations..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 h-10 rounded-xl border-slate-100 bg-white text-[13px] font-medium transition-all focus-visible:ring-0 focus:border-slate-200 focus:shadow-sm placeholder:text-slate-300"
                    />
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="px-5 pb-3 flex gap-1">
                {FILTER_TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveFilter(tab)}
                        className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all flex items-center gap-1.5 ${activeFilter === tab
                            ? "bg-slate-900 text-white"
                            : "text-slate-400 hover:text-slate-600 hover:bg-white"
                            }`}
                    >
                        {tab}
                        {tab === "Unread" && unreadCount > 0 && (
                            <span className={`min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center ${activeFilter === "Unread" ? "bg-white text-slate-900" : "bg-amber-500 text-white"}`}>
                                {unreadCount}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Thread List */}
            <div className="flex-1 min-h-0 relative">
                <ScrollArea className="h-full absolute inset-0">
                    <div className="px-3 pb-6 space-y-0.5">
                        {filteredThreads?.length === 0 ? (
                            <div className="p-10 text-center">
                                <Inbox className="w-8 h-8 text-slate-200 mx-auto mb-3" />
                                <p className="text-[13px] font-medium text-slate-300">
                                    No conversations found
                                </p>
                            </div>
                        ) : (
                            filteredThreads?.map((thread) => {
                                const isUnread = !thread.is_read && !thread.is_archived;
                                return (
                                    <button
                                        key={thread.id}
                                        onClick={() => onSelect(thread.id)}
                                        className={`w-full text-left px-4 py-3.5 rounded-xl transition-all duration-200 relative group/item ${activeId === thread.id
                                            ? "bg-white shadow-sm border border-slate-100"
                                            : isUnread
                                                ? "bg-amber-50/60 hover:bg-amber-50 border border-amber-100/60"
                                                : "hover:bg-white/60 border border-transparent"
                                            }`}
                                    >
                                        {/* Active indicator */}
                                        {activeId === thread.id && (
                                            <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-slate-900 rounded-r-full" />
                                        )}
                                        {/* Unread dot */}
                                        {isUnread && activeId !== thread.id && (
                                            <div className="absolute left-1.5 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-amber-500" />
                                        )}
                                        <div className="flex items-start gap-3">
                                            <div className={`mt-0.5 shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${activeId === thread.id
                                                ? "bg-slate-900 shadow-md shadow-slate-200"
                                                : "bg-white border border-slate-100 group-hover/item:shadow-sm"
                                                }`}>
                                                {thread.channel === "gmail" ? (
                                                    <Mail className={`w-4 h-4 ${activeId === thread.id ? "text-white" : "text-slate-400"}`} />
                                                ) : thread.channel === "whatsapp" ? (
                                                    <MessageSquare className={`w-4 h-4 ${activeId === thread.id ? "text-white" : "text-slate-400"}`} />
                                                ) : (
                                                    <MessageCircle className={`w-4 h-4 ${activeId === thread.id ? "text-white" : "text-slate-400"}`} />
                                                )}
                                            </div>
                                            <div className="flex-1 overflow-hidden min-w-0">
                                                <div className="flex items-center justify-between gap-2">
                                                    <p className={`text-[13px] tracking-tight truncate leading-tight ${isUnread ? "font-bold text-slate-900" : activeId === thread.id ? "font-bold text-slate-900" : "font-semibold text-slate-600"
                                                        }`}>
                                                        {thread.subject ?? "Untitled"}
                                                    </p>
                                                    <span className={`text-[10px] font-medium shrink-0 ${activeId === thread.id ? "text-slate-500" : "text-slate-300"
                                                        }`}>
                                                        {new Date(thread.last_message_at).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2 mt-1.5">
                                                    <span className={`text-[10px] font-semibold uppercase tracking-wider ${activeId === thread.id ? "text-slate-400" : "text-slate-300"
                                                        }`}>
                                                        {thread.channel === "gmail" ? "Email" : thread.channel === "whatsapp" ? "WhatsApp" : thread.channel === "internal" ? "Form" : "SMS"}
                                                    </span>
                                                    {isUnread ? (
                                                        <>
                                                            <span className="w-1 h-1 rounded-full bg-amber-400" />
                                                            <span className="text-[10px] font-bold text-amber-600">New</span>
                                                        </>
                                                    ) : !thread.is_archived ? (
                                                        <>
                                                            <span className="w-1 h-1 rounded-full bg-slate-200" />
                                                            <span className="text-[10px] font-medium text-emerald-500">Active</span>
                                                        </>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 border-t border-slate-100/80 flex items-center justify-between">
                <span className="text-[10px] font-medium text-slate-300">
                    {filteredThreads?.length ?? 0} of {threads?.length ?? 0} shown
                </span>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleSync}
                        disabled={isSyncing}
                        className="flex items-center gap-1.5 text-[10px] font-medium text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                        title="Sync Gmail inbox"
                    >
                        <RefreshCw className={`w-3 h-3 ${isSyncing ? "animate-spin" : ""}`} />
                        Sync
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping absolute inset-0 opacity-40" />
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        </div>
                        <span className="text-[10px] font-medium text-slate-400">Live</span>
                    </div>
                </div>
            </div>
        </div>
    );
}
