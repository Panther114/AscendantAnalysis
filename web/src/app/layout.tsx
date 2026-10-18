import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import Script from "next/script";

import { Footer } from "@/components/Footer";
import { Nav } from "@/components/Nav";
import { labs } from "@/lib/data";
import { labCss } from "@/lib/palette";
import "./globals.css";

const geist = Geist({ variable: "--font-geist", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const instrument = Instrument_Serif({ variable: "--font-instrument", subsets: ["latin"], weight: "400", style: ["normal", "italic"] });

export const metadata: Metadata = {
  title: { default: "Ascendant Analysis: AI Lab Index and Coding-Plan Costs", template: "%s · Ascendant Analysis" },
  description:
    "A deterministic index of how strong and competitive each AI lab's model lineup is, and what every model really costs per task through the best coding-plan subscription. Built on Artificial Analysis data.",
};

// Sets the theme before first paint so there's no flash; the toggle updates the same attribute.
const themeScript = `try{var t=localStorage.getItem("theme");if(t==="dark"||t==="light")document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable} ${instrument.variable}`} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: labCss(labs) }} />
      </head>
      <body className="flex min-h-screen flex-col">
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
        <Nav />
        <main className="mx-auto w-full max-w-[1320px] flex-1 px-4 pb-24 sm:px-6">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
