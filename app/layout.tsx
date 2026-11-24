import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { FooterWrapper } from '@/components/FooterWrapper';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-display',
  display: 'swap',
  weight: ['400', '500', '600', '700', '800'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Vistar Intake OS — Enterprise Schema Normalization & Healing',
  description:
    'Apple-grade client onboarding, perceptual image deduplication, and deterministic schema healing.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} ${plusJakarta.variable} ${jetbrainsMono.variable}`}
    >
      <body
        suppressHydrationWarning
        className="min-h-screen text-[#0A0A0A] font-sans flex flex-col justify-between selection:bg-zinc-200 overflow-x-hidden"
      >
        <div className="w-full flex-1 flex flex-col">
          <Navbar />
          <main className="w-full flex-1 flex flex-col">{children}</main>
        </div>
        <FooterWrapper />
      </body>
    </html>
  );
}
