import NavAside from "@/components/navAside";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Paulo Victor Torres Silva FullStack Developer",
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
      <body className="flex h-screen w-full items-center justify-between">
        <NavAside />
        {children}
        <aside></aside>
      </body>
    </html>
  );
}
