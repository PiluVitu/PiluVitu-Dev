import NavAside from "@/components/navAside";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  generator: "Next.js",
  applicationName: "Portfólio | Paulo Victor Torres Silva",
  referrer: "origin-when-cross-origin",
  keywords: [
    "Next.js",
    "React",
    "JavaScript",
    "DevHatt",
    "DevHat",
    "TypeScript",
  ],
  creator: "Paulo Victor Torres Silva",
  formatDetection: {
    address: false,
    telephone: false,
  },
  publisher: "PiluTech",
  title: {
    template: "%s | Paulo Victor Torres Silva",
    default: "Paulo Victor Torres Silva | FullStack Developer",
  },
  description:
    "Programador, capacitado para atender a suas demandas e executar seus projetos. Especializado em TypeScript | React | TailwindCss | Node | Jest",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={inter.className}>
      <body className="h-w-full flex w-full items-center justify-center max-lg:flex-col ">
        <NavAside />
        {children}
      </body>
    </html>
  );
}
