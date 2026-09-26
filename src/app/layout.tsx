import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";
import { QueryProvider } from "@/components/providers";

const vazirmatn = Vazirmatn({
  subsets: ["arabic", "latin"],
  variable: "--font-vazirmatn",
  display: "swap",
});

// PHASE 27 — bilingual (en default / fa). The cookie p24-lang is written by
// the language switcher (profile + login). localStorage is the runtime truth;
// this tiny pre-paint script reconciles <html lang/dir> with it before the
// first frame (suppressHydrationWarning covers the attribute delta).
const LANG_BOOT_SCRIPT = `(function(){try{var l=localStorage.getItem('p24-lang');if(l!=='fa'&&l!=='en'){var m=document.cookie.match(/(?:^|;\\s*)p24-lang=(en|fa)/);l=m?m[1]:'en';}var d=document.documentElement;d.lang=l;d.dir=(l==='fa')?'rtl':'ltr';document.cookie='p24-lang='+l+';path=/;max-age=31536000;samesite=lax';}catch(e){}})();`;

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const fa = jar.get("p24-lang")?.value === "fa";
  return fa
    ? {
        title: "Printoo24 — سامانه مدیریت چاپ",
        description:
          "سامانه یکپارچه مدیریت چاپ Printoo24 — سفارش‌ها، طراحی، چاپ، انبار و مالی",
      }
    : {
        title: "Printoo24 — Print Management System",
        description:
          "Printoo24 all-in-one print management — orders, design, printing, warehouse and finance",
      };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const jar = await cookies();
  const fa = jar.get("p24-lang")?.value === "fa";
  return (
    <html
      lang={fa ? "fa" : "en"}
      dir={fa ? "rtl" : "ltr"}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
      </head>
      <body className={`${vazirmatn.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <QueryProvider>
            {children}
            <SonnerToaster position="top-left" richColors closeButton />
            <Toaster />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
