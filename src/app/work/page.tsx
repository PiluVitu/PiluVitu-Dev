import { Metadata } from "next";
import Image from "next/image";

import octopost from "../../../public/images/octopost.webp";

export const metadata: Metadata = {
  title: "Trabalhos",
};
//TODO: Versão mobile o menu vai ficar escondido e será exibido quando arrastar da esquerda para direita

export default function Work() {
  return (
    <main className="ml-16 grid max-h-screen w-full grid-cols-6 items-center pl-5">
      <aside className="flex h-full max-h-screen flex-col gap-3 overflow-hidden border-r-2 border-neutral-700 text-sm">
        <h1 className="mt-8 pl-3">Work</h1>
        <div className="flex flex-col gap-2">
          <span className="pl-3 text-neutral-600 brightness-150">
            Vendo agora
          </span>
          <div className=" overflow-hidden">
            <section className="mr-2 flex flex-col gap-1 rounded-2xl bg-neutral-800 p-4 pl-3 brightness-125">
              <h2>Guia Atual</h2>
              <p className="text-pretty h-fit text-neutral-600 brightness-150">
                Dignissimos nam ipsa quasi dolore esse, vero cum dicta a, aut
                rerum quidem cupiditate consectetur odit quam doloribus fugiat
                vitae non laudantium.
              </p>
            </section>
          </div>
        </div>
        <div>
          <span className="pl-3">Próximos</span>
        </div>
      </aside>
      <section className="gap col-span-5 mx-auto flex max-h-screen w-full flex-col items-center justify-start gap-10 overflow-auto pb-24 pt-10">
        <Image
          src={octopost}
          alt="Jajajja"
          width={540}
          priority
          quality={80}
          className="rounded-xl"
        />
        <div className="flex w-[33.75rem] flex-col gap-6">
          <h2 className="text-2xl">Octopost</h2>
          <section className="flex flex-col gap-6">
            <ul className="flex w-full flex-col gap-1">
              <li className="flex gap-2">
                <h3 className="w-[5.5rem] text-sm text-neutral-400">Cliente</h3>
                <p className="w-[26rem]">Alpha</p>
              </li>
              <li className="flex gap-2">
                <h3 className="w-[5.5rem] text-sm text-neutral-400">Data</h3>
                <time className="w-[26rem]">Jan 22 - Jul 22</time>
              </li>
              <li className="flex gap-2">
                <h3 className="w-[5.5rem] text-sm text-neutral-400">
                  Ocupação
                </h3>
                <p className="w-[26rem]">Full Stack Developer</p>
              </li>
              <li className="flex gap-2">
                <h3 className="w-[5.5rem] text-sm text-neutral-400">
                  Descrição
                </h3>
                <p className="w-[26rem]">
                  Lorem ipsum dolor, sit amet consectetur adipisicing elit.
                  Dignissimos nam ipsa quasi dolore esse, vero cum dicta a, aut
                  rerum quidem cupiditate consectetur odit quam doloribus fugiat
                  vitae non laudantium.
                </p>
              </li>
            </ul>
            <p className="text-pretty whitespace-pre-wrap">
              Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt
              quibusdam officiis minus expedita laboriosam voluptatibus eum
              recusandae ipsum reprehenderit voluptatum nisi, alias nihil magnam
              ab, perferendis, quasi doloremque voluptas illo?
            </p>
            <p className="text-pretty whitespace-pre-wrap">
              Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt
              quibusdam officiis minus expedita laboriosam voluptatibus eum
              recusandae ipsum reprehenderit voluptatum nisi, alias nihil magnam
              ab, perferendis, quasi doloremque voluptas illo?
            </p>
            <p className="text-pretty whitespace-pre-wrap">
              Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt
              quibusdam officiis minus expedita laboriosam voluptatibus eum
              recusandae ipsum reprehenderit voluptatum nisi, alias nihil magnam
              ab, perferendis, quasi doloremque voluptas illo?
            </p>
            <p className="text-pretty whitespace-pre-wrap">
              Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt
              quibusdam officiis minus expedita laboriosam voluptatibus eum
              recusandae ipsum reprehenderit voluptatum nisi, alias nihil magnam
              ab, perferendis, quasi doloremque voluptas illo?
            </p>
            <p className="text-pretty whitespace-pre-wrap">
              Lorem ipsum dolor, sit amet consectetur adipisicing elit. Incidunt
              quibusdam officiis minus expedita laboriosam voluptatibus eum
              recusandae ipsum reprehenderit voluptatum nisi, alias nihil magnam
              ab, perferendis, quasi doloremque voluptas illo?
            </p>
          </section>
        </div>
        <footer className="pt-64">
          <p>&copy; 2023 protifolio by @piluvitu </p>
          <p>Inspired by @justinmfarrugia</p>
        </footer>
      </section>
    </main>
  );
}
