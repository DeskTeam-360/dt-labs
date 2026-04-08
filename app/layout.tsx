import type { Metadata } from "next";
import Script from "next/script";
// import { Geist, Geist_Mono } from "next/font/google";
import AntdProvider from "@/components/AntdProvider";
import { auth } from "@/auth";
import "./globals.css?v=1.0.1";

const themeInitScript = `
(function(){
  try {
    var k = 'deskteam-theme';
    var s = localStorage.getItem(k) || 'system';
    var dark = s === 'dark' || (s !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', dark);
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
  } catch (e) {}
})();`;

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME,
  description: process.env.NEXT_PUBLIC_APP_DESCRIPTION,
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth()
  return (
    // Browser extensions (Grammarly, password managers) mutate the DOM before hydrate; suppress root warnings.
    <html lang="en" suppressHydrationWarning>
      <body
        suppressHydrationWarning
        // className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Script id="deskteam-theme-init" strategy="beforeInteractive">
          {themeInitScript}
        </Script>
        <AntdProvider session={session}>
          {children}
        </AntdProvider>
      </body>
    </html>
  );
}
