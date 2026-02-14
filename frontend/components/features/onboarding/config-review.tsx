"use client";

import { useOnboardingStore } from "@/stores/onboarding-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

export function ConfigReview() {
    const { mergedConfig, recordings, setStep, reset } = useOnboardingStore();

    const hasConfig = Object.keys(mergedConfig).length > 0;

    function handleConfirm() {
        // In production: POST mergedConfig to create workspace settings
        setStep("complete");
    }

    function handleReRecord() {
        setStep("recording");
    }

    if (!hasConfig) {
        return (
            <Card className="w-full max-w-md text-center">
                <CardContent className="py-8">
                    <p className="text-muted-foreground">No configuration generated yet.</p>
                    <Button className="mt-4" onClick={() => setStep("recording")}>
                        Start Recording
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="w-full max-w-lg">
            <CardHeader>
                <CardTitle>Review Your Setup</CardTitle>
                <CardDescription>
                    Here&apos;s what we understood from your voice input.
                    Edit or re-record if anything looks off.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {/* Business name */}
                {mergedConfig.business_name && (
                    <div>
                        <p className="text-sm font-medium text-muted-foreground">Business Name</p>
                        <p className="text-lg font-semibold">{mergedConfig.business_name}</p>
                    </div>
                )}

                <Separator />

                {/* Services */}
                {mergedConfig.services && mergedConfig.services.length > 0 && (
                    <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Services</p>
                        <div className="space-y-2">
                            {mergedConfig.services.map((svc, i) => (
                                <div
                                    key={i}
                                    className="flex items-center justify-between p-3 rounded-lg bg-muted"
                                >
                                    <div>
                                        <p className="font-medium">{svc.name}</p>
                                        {svc.description && (
                                            <p className="text-sm text-muted-foreground">{svc.description}</p>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        {svc.duration_mins && (
                                            <Badge variant="secondary">{svc.duration_mins}min</Badge>
                                        )}
                                        {svc.price && (
                                            <Badge variant="outline">₹{svc.price}</Badge>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <Separator />

                {/* Business hours */}
                {mergedConfig.business_hours && mergedConfig.business_hours.length > 0 && (
                    <div>
                        <p className="text-sm font-medium text-muted-foreground mb-2">Business Hours</p>
                        <div className="grid grid-cols-2 gap-2">
                            {mergedConfig.business_hours.map((hrs, i) => (
                                <div key={i} className="text-sm">
                                    <span className="font-medium">{hrs.day}:</span>{" "}
                                    {hrs.open} – {hrs.close}
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recordings count */}
                <p className="text-xs text-muted-foreground">
                    Based on {recordings.length} voice recording{recordings.length !== 1 ? "s" : ""}.
                </p>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <Button onClick={handleConfirm} className="flex-1">
                        Confirm &amp; Create Workspace
                    </Button>
                    <Button variant="outline" onClick={handleReRecord}>
                        Re-record
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
