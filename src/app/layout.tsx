import type { Metadata } from "next";
import { Toaster } from "sonner";
import { CommandBar, CommandBarTrigger } from "@/shared/presentation/components/CommandBar";
import { Sidebar } from "@/shared/presentation/components/Sidebar";
import { THEME_SCRIPT, ThemeToggle } from "@/shared/presentation/components/ThemeToggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "Finanzas Local-First",
  description: "Planificación de gastos mensuales 100% local",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen">
        <div className="mx-auto flex min-h-screen max-w-[1400px] flex-col md:flex-row">
          <aside className="border-b p-3 md:sticky md:top-0 md:h-screen md:w-56 md:shrink-0 md:border-b-0 md:border-r md:p-4">
            <div className="mb-4 hidden items-center gap-2 px-2 md:flex">
              <div className="flex size-7 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">$</div>
              <div className="leading-tight">
                <p className="text-sm font-semibold">Finanzas</p>
                <p className="text-[10px] text-muted-foreground">local-first · SQLite</p>
              </div>
            </div>
            <Sidebar />
          </aside>
          <div className="flex min-w-0 flex-1 flex-col">
            <header className="sticky top-0 z-10 flex items-center gap-3 border-b bg-background/80 px-4 py-2.5 backdrop-blur md:px-8">
              <CommandBarTrigger />
              <div className="ml-auto">
                <ThemeToggle />
              </div>
            </header>
            <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
          </div>
        </div>
        <CommandBar />
        <Toaster richColors position="bottom-right" />
      </body>
    </html>
  );
}
