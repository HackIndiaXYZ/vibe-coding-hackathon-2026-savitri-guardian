import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Outlet, createRootRouteWithContext, HeadContent, Scripts } from "@tanstack/react-router";
import { type ReactNode } from "react";

import appCss from "../styles.css?url";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/lib/auth-context";
import { LanguageProvider } from "@/lib/i18n";
import { Toaster } from "@/components/ui/sonner";
import { GlobalErrorFallback } from "@/components/GlobalErrorFallback";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-muted-foreground">Page not found.</p>
        <a href="/" className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-primary-foreground">Go home</a>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  return <GlobalErrorFallback error={error} reset={reset} boundary="root" />;
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1" },
      { title: "Savitri — Emergency Response" },
      { name: "description", content: "Savitri is an AI-powered emergency identity and response platform that helps bystanders, EMTs, hospitals, and families coordinate life-saving care in real time." },
      { name: "theme-color", content: "#0a1a14" },
      { property: "og:title", content: "Savitri — Emergency Response" },
      { name: "twitter:title", content: "Savitri — Emergency Response" },
      { property: "og:description", content: "Savitri is an AI-powered emergency identity and response platform that helps bystanders, EMTs, hospitals, and families coordinate life-saving care in real time." },
      { name: "twitter:description", content: "Savitri is an AI-powered emergency identity and response platform that helps bystanders, EMTs, hospitals, and families coordinate life-saving care in real time." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/vT2VmNBl1YSOdVWAiDwY0qZspDj1/social-images/social-1780246309988-Screenshot_2026-05-31_at_22.21.29.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/vT2VmNBl1YSOdVWAiDwY0qZspDj1/social-images/social-1780246309988-Screenshot_2026-05-31_at_22.21.29.webp" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>
          <LanguageProvider>
            <Outlet />
            <Toaster richColors position="top-center" />
          </LanguageProvider>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
