import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { type NextRequest } from "next/server";

export async function GET(request: NextRequest) {
    const { searchParams, origin } = new URL(request.url);
    const code = searchParams.get("code");
    const next = searchParams.get("next") ?? "/";

    if (code) {
        const response = NextResponse.redirect(`${origin}/login`);

        // Auth client — uses anon key to exchange code for session (sets cookies)
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return request.cookies.getAll();
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            response.cookies.set(name, value, options);
                        });
                    },
                },
            }
        );

        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
            const {
                data: { user },
            } = await supabase.auth.getUser();

            if (user) {
                // Admin client — bypass RLS for provisioning inserts
                const adminClient = createClient(
                    process.env.NEXT_PUBLIC_SUPABASE_URL!,
                    process.env.SUPABASE_SERVICE_ROLE_KEY!
                );

                // Check if user already has a profile
                const { data: profile } = await adminClient
                    .from("profiles")
                    .select("workspace_id, role, workspaces(slug)")
                    .eq("id", user.id)
                    .single();

                if (profile?.workspaces) {
                    const ws = profile.workspaces as any;
                    const slug = Array.isArray(ws) ? ws[0]?.slug : ws?.slug;
                    if (slug) {
                        response.headers.set(
                            "Location",
                            new URL(`/${slug}`, origin).toString()
                        );
                        return response;
                    }
                }

                // New user — create workspace + profile via admin client (bypasses RLS)
                const slug = `ws-${user.id.slice(0, 8)}`;

                const { data: workspace, error: wsError } = await adminClient
                    .from("workspaces")
                    .insert({
                        name: user.email?.split("@")[0] ?? "My Business",
                        slug,
                        settings: {},
                    })
                    .select("id")
                    .single();

                if (workspace) {
                    await adminClient.from("profiles").insert({
                        id: user.id,
                        workspace_id: workspace.id,
                        role: "owner",
                        full_name: user.email?.split("@")[0] ?? "",
                    });

                    response.headers.set(
                        "Location",
                        new URL(`/${slug}/onboarding`, origin).toString()
                    );
                    return response;
                }

                console.error("Failed to create workspace:", wsError);
            }

            // Fallback
            response.headers.set(
                "Location",
                new URL(next, origin).toString()
            );
            return response;
        }
    }

    return NextResponse.redirect(`${origin}/login?error=auth-failure`);
}
