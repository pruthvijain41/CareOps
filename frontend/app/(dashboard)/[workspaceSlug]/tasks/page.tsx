"use client";

import { useParams } from "next/navigation";

export default function TasksPage() {
    const params = useParams<{ workspaceSlug: string }>();
    const slug = params.workspaceSlug;

    return (
        <div className="p-6 space-y-8">
            <div className="border-l-2 border-primary pl-4">
                <h1 className="text-2xl font-mono font-black uppercase tracking-widest leading-none">
                    STAFF_TASKS
                </h1>
                <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-tighter">
                    WORKSPACE_ID: {slug?.toUpperCase()} // PENDING_ASSIGNMENTS
                </p>
            </div>

            <div className="border border-border bg-card">
                <div className="border-b border-border bg-muted/30 p-4">
                    <h2 className="font-mono text-[10px] font-bold uppercase tracking-widest">TASK_QUEUE</h2>
                </div>
                <div className="p-12 text-center opacity-30">
                    <p className="font-mono text-xs uppercase tracking-widest italic">
                        NO_ACTIVE_TASKS_IN_QUEUE // STAND_BY_FOR_DISPATCH
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-border p-4 bg-muted/5 flex flex-col gap-2">
                    <div className="h-2 w-12 bg-primary/20" />
                    <div className="h-4 w-full bg-border/20" />
                    <div className="h-4 w-2/3 bg-border/20" />
                </div>
                <div className="border border-border p-4 bg-muted/5 flex flex-col gap-2">
                    <div className="h-2 w-12 bg-primary/20" />
                    <div className="h-4 w-full bg-border/20" />
                    <div className="h-4 w-2/3 bg-border/20" />
                </div>
            </div>
        </div>
    );
}
