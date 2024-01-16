import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Trabalhos",
};
//TODO: Versão mobile o menu vai ficar escondido e será exibido quando arrastar da esquerda para direita

export default function Work() {
  return (
    <main className="ml-16 grid h-screen w-full grid-cols-4 items-center pl-4">
      <aside className="h-full w-full border-r-2 border-neutral-700">
        <h1>Work</h1>
      </aside>
      <section className="col-span-3 flex w-full flex-col items-center justify-start">
        Trabaio
        <footer>
          <p>&copy; 2023 protifolio by @piluvitu </p>
          <p>Inspired by @justinmfarrugia</p>
        </footer>
      </section>
    </main>
  );
}
