"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Edit3, Check } from "lucide-react";

interface TranscriptEditProps {
    transcript: string;
    onTranscriptChange: (newTranscript: string) => void;
    onConfirm: () => void;
    disabled?: boolean;
}

export function TranscriptEdit({
    transcript,
    onTranscriptChange,
    onConfirm,
    disabled
}: TranscriptEditProps) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h3 className="font-mono text-[10px] uppercase font-black tracking-widest flex items-center gap-2">
                    <Edit3 className="w-3.5 h-3.5" /> TRANSCRIPT_REVIEW
                </h3>
                <span className="font-mono text-[8px] uppercase opacity-40">Edit_Mode: Enabled</span>
            </div>

            <div className="relative border border-border bg-muted/10 p-4">
                <Textarea
                    value={transcript}
                    onChange={(e) => onTranscriptChange(e.target.value)}
                    className="min-h-[120px] rounded-none border-none bg-transparent font-mono text-xs leading-relaxed lowercase focus-visible:ring-0 p-0"
                    placeholder="Neural transcript stream..."
                    disabled={disabled}
                />
                <div className="absolute right-2 bottom-2">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse opacity-20" />
                </div>
            </div>

            <Button
                variant="outline"
                className="w-full rounded-none h-11 border-primary/20 hover:border-primary font-mono text-[10px] uppercase tracking-widest gap-2 bg-primary/5"
                onClick={onConfirm}
                disabled={disabled || !transcript.trim()}
            >
                CONFIRM_TRANSCRIPT <Check className="w-3.5 h-3.5" />
            </Button>

            <p className="text-center font-mono text-[8px] uppercase opacity-30 tracking-tighter">
                Manual correction ensures high-density data integrity.
            </p>
        </div>
    );
}
