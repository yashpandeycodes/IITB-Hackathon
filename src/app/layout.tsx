import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "CIT Nexus — Every Campus Resource. One Intelligent System.",
  description: "CIT Nexus brings timetables, examinations, rooms, and campus events into one coordinated spatial command center for Chilika Institute of Technology.",
  keywords: [
    "CIT Nexus",
    "Chilika Institute of Technology",
    "Campus Operations",
    "Timetable Optimization",
    "Venue Management",
    "Room Scheduling",
    "Exam Scheduling",
  ],
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-[#070A12] text-[#F4F7FB] selection:bg-[#66E3F0]/20 selection:text-[#66E3F0]">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
