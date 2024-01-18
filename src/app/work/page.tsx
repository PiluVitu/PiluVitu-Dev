import { Metadata } from "next";
import Image from "next/image";

import octopost from "../../../public/images/octopost.webp";

export const metadata: Metadata = {
  title: "Trabalhos",
};
//TODO: Versão mobile o menu vai ficar escondido e será exibido quando arrastar da esquerda para direita

export default function Work() {
  return (
    <main className="ml-16 grid max-h-screen w-full grid-cols-4 items-center pl-4">
      <aside className="h-full max-h-screen overflow-hidden border-r-2 border-neutral-700">
        <h1 className="mt-8">Work</h1>
      </aside>
      <section className="gap col-span-3 mx-auto flex max-h-screen w-full flex-col items-center justify-start gap-10 overflow-auto pb-24 pt-10">
        <Image
          src={octopost}
          alt="Jajajja"
          width={540}
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
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Soluta
              fugit aperiam, sequi natus porro eius labore quod fuga quae cum
              consequuntur asperiores quam incidunt, blanditiis qui odio impedit
              quo voluptatum! Lorem ipsum dolor sit amet consectetur adipisicing
              elit. Delectus, maiores, perferendis ab ipsa nam deleniti
              veritatis consequatur nemo eum, perspiciatis ratione? Illo nobis
              id obcaecati odio! Adipisci minus unde quas! Lorem ipsum dolor sit
              amet, consectetur adipisicing elit. Impedit aperiam facere
              accusantium blanditiis, beatae vitae tempore ab pariatur, non
              distinctio eius quos, est maxime ipsa voluptas? Magnam doloremque
              omnis aliquid? Lorem ipsum dolor sit amet consectetur adipisicing
              elit. Numquam consequatur non voluptate animi nam reprehenderit
              doloremque nemo aut vel iste similique provident, exercitationem
              corrupti perspiciatis. Hic obcaecati sint expedita vel! Lorem
              ipsum dolor sit amet consectetur adipisicing elit. Sit, magni.
              Mollitia ex, ullam modi velit nostrum quae a ea soluta porro
              ducimus ad labore commodi quidem, veritatis cumque eos laudantium.
              Lorem ipsum dolor sit amet consectetur adipisicing elit.
              Dignissimos rem illo necessitatibus consequuntur consectetur quam
              quisquam, at culpa obcaecati, animi veniam, sint explicabo velit
              eos quos odio quaerat quasi quia! Lorem ipsum dolor sit amet
              consectetur adipisicing elit. Ea, cumque? Recusandae minima fugiat
              nulla inventore cumque cupiditate iste architecto. Itaque, optio.
              Sapiente sint eius deserunt eligendi reprehenderit! Maiores,
              blanditiis earum. Lorem ipsum dolor sit, amet consectetur
              adipisicing elit. Libero dolor similique mollitia repellat
              perferendis consectetur cupiditate, molestiae alias minus beatae
              repellendus laborum, quisquam pariatur quis fugiat adipisci
              recusandae cumque voluptate. Lorem ipsum dolor sit amet
              consectetur adipisicing elit. Possimus exercitationem, architecto,
              deserunt laborum magnam molestiae beatae facere odit dolor
              repellendus nulla incidunt iure cum minima. In delectus minus
              aperiam modi? Lorem ipsum dolor, sit amet consectetur adipisicing
              elit. Cupiditate, expedita officiis dolor eveniet minus ea commodi
              magnam quidem corrupti necessitatibus tempora a sint earum ab
              ipsam facere non, voluptatibus consectetur. Lorem ipsum dolor sit
              amet consectetur adipisicing elit. Perspiciatis incidunt voluptate
              est distinctio perferendis? Fugiat ad, eos saepe earum ex est
              aliquam magnam facilis voluptate eveniet excepturi obcaecati odio.
              Sunt? Lorem, ipsum dolor sit amet consectetur adipisicing elit.
              Asperiores ipsa necessitatibus architecto eligendi repudiandae
              beatae consectetur amet ad, dolores nemo exercitationem fuga,
              quisquam aliquam, iste modi cumque inventore? Aliquam, aperiam?
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
