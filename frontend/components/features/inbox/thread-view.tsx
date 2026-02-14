"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getInboxThread, replyToThread, getSuggestedReplies } from "@/lib/api";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
    Loader2,
    Send,
    Mail,
    MessageCircle,
    MoreHorizontal,
    Sparkles,
    RefreshCw,
    Zap,
    ArrowRight,
    X,
} from "lucide-react";
import { useParams } from "next/navigation";

interface Message {
    id: string;
    body: string;
    source: string;
    sender_type: "contact" | "staff" | "system";
    sent_at: string;
}

interface ThreadViewProps {
    threadId: string;
}

/**
 * Format message body: strip raw markdown formatting like **text**
 * and convert to clean readable text with proper structure
 */
function formatMessageBody(body: string): string {
    if (!body) return "";

    // Remove markdown bold **text** -> text
    let cleaned = body.replace(/\*\*([^*]+)\*\*/g, "$1");
    // Remove markdown italic *text* -> text (but not ** which we already handled)
    cleaned = cleaned.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "$1");
    // Remove markdown heading markers
    cleaned = cleaned.replace(/^#{1,3}\s+/gm, "");
    // Clean up excessive newlines
    cleaned = cleaned.replace(/\n{3,}/g, "\n\n");

    return cleaned.trim();
}

/** Map detected intent to a readable label + color */
function getIntentLabel(intent: string): { label: string; color: string } | null {
    const map: Record<string, { label: string; color: string }> = {
        reschedule: { label: "Rescheduling", color: "bg-amber-50 text-amber-600 border-amber-200" },
        cancel: { label: "Cancellation", color: "bg-rose-50 text-rose-600 border-rose-200" },
        inquiry: { label: "Inquiry", color: "bg-blue-50 text-blue-600 border-blue-200" },
        complaint: { label: "Complaint", color: "bg-red-50 text-red-600 border-red-200" },
        follow_up: { label: "Follow-up", color: "bg-emerald-50 text-emerald-600 border-emerald-200" },
        greeting: { label: "Greeting", color: "bg-violet-50 text-violet-600 border-violet-200" },
    };
    return map[intent] ?? null;
}

export function ThreadView({ threadId }: ThreadViewProps) {
    const queryClient = useQueryClient();
    const params = useParams<{ workspaceSlug: string }>();
    const [replyBody, setReplyBody] = useState("");
    const [showSuggestions, setShowSuggestions] = useState(true);
    const [userDismissedSuggestions, setUserDismissedSuggestions] = useState(false);
    const scrollAnchorRef = useRef<HTMLDivElement>(null);

    const { data: thread, isLoading } = useQuery({
        queryKey: ["thread", threadId],
        queryFn: () => getInboxThread(threadId),
        enabled: !!threadId,
    });

    // When thread loads and is marked as read on backend, refetch conversations list
    useEffect(() => {
        if (thread) {
            queryClient.invalidateQueries({ queryKey: ["conversations", params.workspaceSlug] });
        }
    }, [thread?.id]);

    // Check if last message is from customer (to show suggestions)
    const lastMessage = thread?.messages?.[thread.messages.length - 1];
    const shouldFetchSuggestions =
        !!thread && lastMessage?.sender_type === "contact" && showSuggestions && !userDismissedSuggestions;

    // Fetch AI suggestions
    const {
        data: aiSuggestions,
        isLoading: suggestionsLoading,
        refetch: refetchSuggestions,
        isFetching: suggestionsRefetching,
    } = useQuery({
        queryKey: ["suggestions", threadId],
        queryFn: () => getSuggestedReplies(threadId),
        enabled: shouldFetchSuggestions,
        staleTime: 1000 * 60 * 5, // 5 min cache
        refetchOnWindowFocus: false,
    });

    // Reset suggestions state when thread changes
    useEffect(() => {
        setShowSuggestions(true);
        setUserDismissedSuggestions(false);
        setReplyBody("");
    }, [threadId]);

    const replyMutation = useMutation({
        mutationFn: ({ threadId, body }: { threadId: string; body: string }) =>
            replyToThread(threadId, body),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["thread", threadId] });
            queryClient.invalidateQueries({ queryKey: ["suggestions", threadId] });
            setReplyBody("");
            setShowSuggestions(false);
        },
    });

    useEffect(() => {
        if (scrollAnchorRef.current) {
            // behavior: "smooth" with scrollIntoView can sometimes jump the whole page
            // "nearest" ensures it stays within its own scroll container
            scrollAnchorRef.current.scrollIntoView({ behavior: "auto", block: "nearest" });
        }
    }, [thread?.messages]);

    const handleSend = () => {
        if (!replyBody.trim() || replyMutation.isPending) return;
        replyMutation.mutate({ threadId, body: replyBody });
    };

    const handleUseSuggestion = (suggestion: string) => {
        setReplyBody(suggestion);
        setShowSuggestions(false);
    };

    const handleDismissSuggestions = () => {
        setUserDismissedSuggestions(true);
        setShowSuggestions(false);
    };

    if (isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
                <span className="text-[13px] font-medium text-slate-300">Loading messages...</span>
            </div>
        );
    }

    if (!thread) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-[13px] font-medium text-slate-300">Conversation not found</p>
            </div>
        );
    }

    const hasSuggestions = aiSuggestions?.suggestions && aiSuggestions.suggestions.length > 0;
    const intentInfo = aiSuggestions?.detected_intent ? getIntentLabel(aiSuggestions.detected_intent) : null;

    return (
        <div className="flex flex-col h-full bg-white">
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 shrink-0">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${thread.channel === "gmail"
                                ? "bg-blue-50 text-blue-600"
                                : "bg-violet-50 text-violet-600"
                                }`}
                        >
                            {thread.channel === "gmail" ? (
                                <Mail className="w-4 h-4" />
                            ) : (
                                <MessageCircle className="w-4 h-4" />
                            )}
                        </div>
                        <div>
                            <h2 className="font-display font-bold text-[15px] tracking-tight text-slate-900 leading-none">
                                {thread.subject ?? "Conversation"}
                            </h2>
                            <p className="text-[11px] font-medium text-slate-400 mt-1">
                                via {thread.channel === "gmail" ? "Email" : thread.channel === "whatsapp" ? "WhatsApp" : thread.channel === "internal" ? "Form" : "SMS"}
                                <span className="mx-2 text-slate-200">·</span>
                                {thread.messages?.length ?? 0} messages
                            </p>
                        </div>
                    </div>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="rounded-xl w-9 h-9 text-slate-300 hover:text-slate-600 hover:bg-slate-50 transition-all"
                    >
                        <MoreHorizontal className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Messages */}
            <ScrollArea className="flex-1 h-0">
                <div className="flex flex-col min-h-full">
                    <div className="p-6 space-y-6 flex-1">
                        {thread.messages?.map((msg: Message) => {
                            const isCustomer = msg.sender_type === "contact";
                            const isSystem = msg.sender_type === "system";
                            const cleanBody = formatMessageBody(msg.body);

                            if (isSystem) {
                                return (
                                    <div key={msg.id} className="flex justify-center animate-in fade-in duration-300">
                                        <div className="px-4 py-2 rounded-full bg-slate-50 border border-slate-100">
                                            <p className="text-[11px] font-medium text-slate-400">{cleanBody}</p>
                                        </div>
                                    </div>
                                );
                            }

                            return (
                                <div
                                    key={msg.id}
                                    className={`flex flex-col ${isCustomer ? "items-start" : "items-end"} animate-in fade-in slide-in-from-bottom-1 duration-300`}
                                >
                                    <div className={`flex items-center gap-2 mb-1.5 px-1 ${isCustomer ? "" : "flex-row-reverse"}`}>
                                        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                            {isCustomer ? "Customer" : "You"}
                                        </span>
                                        <span className="w-1 h-1 rounded-full bg-slate-200" />
                                        <span className="text-[10px] font-medium text-slate-300">
                                            {new Date(msg.sent_at).toLocaleTimeString([], {
                                                hour12: true,
                                                hour: "numeric",
                                                minute: "2-digit",
                                            })}
                                        </span>
                                    </div>
                                    <div
                                        className={`max-w-[75%] px-5 py-3.5 text-[13px] leading-relaxed tracking-tight ${isCustomer
                                            ? "bg-slate-50 text-slate-700 border border-slate-100 rounded-2xl rounded-tl-md"
                                            : "bg-slate-900 text-white rounded-2xl rounded-tr-md shadow-md shadow-slate-200"
                                            }`}
                                    >
                                        <p className="font-medium whitespace-pre-wrap">{cleanBody}</p>
                                    </div>
                                </div>
                            );
                        })}
                        {replyMutation.isPending && (
                            <div className="flex flex-col items-end animate-pulse opacity-50">
                                <div className="flex items-center gap-2 mb-1.5 px-1 flex-row-reverse">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                        You
                                    </span>
                                </div>
                                <div className="bg-slate-900 text-white px-5 py-3.5 rounded-2xl rounded-tr-md max-w-[75%] text-[13px] shadow-md shadow-slate-200">
                                    <p className="font-medium">{replyBody}</p>
                                </div>
                            </div>
                        )}
                        <div ref={scrollAnchorRef} />
                    </div>
                </div>
            </ScrollArea>

            {/* ── AI Suggestions — compact inline bar ─────────────────── */}
            {
                shouldFetchSuggestions && (suggestionsLoading || hasSuggestions) && (
                    <div className="px-4 py-2 border-t border-slate-100 bg-slate-50/60 shrink-0 animate-in fade-in duration-200">
                        {suggestionsLoading && !hasSuggestions ? (
                            <div className="flex items-center gap-2">
                                <Sparkles className="w-3.5 h-3.5 text-violet-400 animate-pulse" />
                                <span className="text-[11px] font-medium text-slate-400">Thinking...</span>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                {/* Label */}
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <Sparkles className="w-3 h-3 text-violet-500" />
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI</span>
                                </div>

                                {intentInfo && (
                                    <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 ${intentInfo.color}`}>
                                        {intentInfo.label}
                                    </span>
                                )}

                                <span className="text-slate-200 shrink-0">│</span>

                                {/* Suggestion chips — scrollable row */}
                                <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0 no-scrollbar">
                                    {aiSuggestions?.suggestions.map((suggestion: string, i: number) => (
                                        <button
                                            key={i}
                                            onClick={() => handleUseSuggestion(suggestion)}
                                            className="shrink-0 max-w-[280px] text-left px-3 py-1 rounded-lg border border-slate-200 bg-white text-[12px] font-medium text-slate-600 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700 transition-all truncate"
                                            title={suggestion}
                                        >
                                            {suggestion}
                                        </button>
                                    ))}
                                </div>

                                {/* Actions */}
                                <div className="flex items-center gap-0.5 shrink-0">
                                    <button
                                        onClick={() => refetchSuggestions()}
                                        disabled={suggestionsRefetching}
                                        className="p-1 rounded-md text-slate-300 hover:text-violet-500 hover:bg-violet-50 transition-all"
                                    >
                                        <RefreshCw className={`w-3 h-3 ${suggestionsRefetching ? "animate-spin" : ""}`} />
                                    </button>
                                    <button
                                        onClick={handleDismissSuggestions}
                                        className="p-1 rounded-md text-slate-300 hover:text-slate-500 hover:bg-slate-100 transition-all"
                                    >
                                        <X className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )
            }


            {/* Reply Input */}
            <div className="px-6 py-4 border-t border-slate-100 shrink-0 bg-white">
                <div className="flex gap-3 items-end">
                    <Textarea
                        placeholder="Type your reply..."
                        className="flex-1 min-h-[48px] max-h-[120px] resize-none border border-slate-100 bg-slate-50/50 rounded-xl px-4 py-3 text-[13px] font-medium focus-visible:ring-0 focus:border-slate-200 focus:bg-white transition-all placeholder:text-slate-300"
                        value={replyBody}
                        onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReplyBody(e.target.value)}
                        onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                    />
                    <Button
                        className="h-[48px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-[13px] gap-2 px-5 shadow-md shadow-slate-200 transition-all active:scale-[0.98] shrink-0"
                        disabled={!replyBody.trim() || replyMutation.isPending}
                        onClick={handleSend}
                    >
                        {replyMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <>
                                Send <Send className="w-3.5 h-3.5" />
                            </>
                        )}
                    </Button>
                </div>
                <p className="text-[10px] text-slate-300 font-medium mt-2.5 text-center">
                    Press Enter to send · Shift+Enter for new line
                </p>
            </div>
        </div >
    );
}
