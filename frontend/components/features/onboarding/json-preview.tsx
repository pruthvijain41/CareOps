"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, ShieldCheck } from "lucide-react";

interface JsonPreviewProps {
    data: any;
    onFinalize: () => void;
    isLoading?: boolean;
}

export function JsonPreview({ data, onFinalize, isLoading }: JsonPreviewProps) {
    return (
        <Card className="rounded-none border-border bg-card shadow-none">
            <CardHeader className="py-3 px-4 border-b border-border bg-muted/30">
                <CardTitle className="text-xs font-mono font-bold uppercase tracking-widest flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4" /> CONFIG_MANIFEST_V1
                </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
                <div className="bg-background border border-border p-4 mb-6 overflow-auto max-h-[400px]">
                    <pre className="font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap">
                        {JSON.stringify(data, null, 2)}
                    </pre>
                </div>

                <div className="flex items-center justify-between gap-4 p-4 border border-primary/20 bg-primary/5">
                    <div className="flex flex-col gap-1">
                        <span className="font-mono text-[10px] uppercase font-black tracking-widest">VALIDATION_READY</span>
                        <span className="font-mono text-[8px] uppercase opacity-60">System configuration is compliant with industrial standards.</span>
                    </div>
                    <Button
                        className="rounded-none h-10 px-6 font-mono text-[10px] uppercase tracking-widest"
                        onClick={onFinalize}
                        disabled={isLoading}
                    >
                        {isLoading ? "FINALIZING..." : (
                            <>
                                AUTHORIZE_COMMIT <Check className="ml-2 w-4 h-4" />
                            </>
                        )}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
