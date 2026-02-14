"use client";

import { useState, Suspense } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { ThreadList } from "@/components/features/inbox/thread-list";
import { ThreadView } from "@/components/features/inbox/thread-view";
import { Loader2, Inbox, MessageSquare } from "lucide-react";

function InboxContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const params = useParams<{ workspaceSlug: string }>();
    const selectedId = searchParams.get("t");

    const handleSelect = (id: string) => {
        const newParams = new URLSearchParams(searchParams.toString());
        newParams.set("t", id);
        router.push(`/${params.workspaceSlug}/inbox?${newParams.toString()}`, { scroll: false });
    };

    return (
        <div className="h-[calc(100vh-90px)] md:h-[calc(100vh-100px)] flex flex-col bg-white overflow-hidden rounded-2xl border border-slate-100 shadow-sm relative">
            {/* Main Layout Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Thread List Pane */}
                <div className="w-80 lg:w-[360px] shrink-0 h-full border-r border-slate-100 flex flex-col bg-slate-50/30">
                    <ThreadList onSelect={handleSelect} activeId={selectedId ?? undefined} />
                </div>

                {/* Conversation View Pane */}
                <div className="flex-1 h-full bg-white">
                    {selectedId ? (
                        <ThreadView key={selectedId} threadId={selectedId} />
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center p-20 text-center animate-in fade-in duration-700">
                            <div className="relative mb-10">
                                <div className="absolute inset-0 bg-slate-100/50 blur-[40px] rounded-full scale-150" />
                                <div className="relative w-20 h-20 rounded-2xl bg-white shadow-lg shadow-slate-100 flex items-center justify-center border border-slate-100">
                                    <MessageSquare className="w-8 h-8 text-slate-300" />
                                </div>
                            </div>
                            <h3 className="font-display font-bold text-xl tracking-tight text-slate-900 mb-3">
                                Select a conversation
                            </h3>
                            <p className="text-slate-400 text-[13px] max-w-[300px] leading-relaxed font-medium">
                                Choose a thread from the list to view the full message history and reply.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default function InboxPage() {
    return (
        <Suspense fallback={
            <div className="h-full flex items-center justify-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-300" />
            </div>
        }>
            <InboxContent />
        </Suspense>
    );
}
