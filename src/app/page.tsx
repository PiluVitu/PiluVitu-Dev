import Clock from "@/components/clock";
import ContentSection from "@/components/contentSection";
import {
  GithubLogo,
  InstagramLogo,
  LinkedinLogo,
  TwitchLogo,
  TwitterLogo,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import profileImage from "../../public/zoro-2-1384x752.jpg";

export default function Home() {
  return (
    <main className="flex max-w-2xl flex-col items-center justify-center pb-24 pt-10">
      <header className="flex flex-col items-center justify-center">
        <Clock />
        <section className="flex flex-col items-center justify-center">
          <Image
            src={profileImage}
            alt="Profile Image"
            width={100}
            height={100}
            className="rounded-full"
          ></Image>
          <h1>Paulo Victor T Silva</h1>
          <h2>Desenvolvedor Full-Stack</h2>
        </section>
        <h2>Disponível para novas oportunidades</h2>
        <ul className="flex items-center justify-center gap-5">
          <li>
            <Link href="/linkedin" target="_blank">
              <LinkedinLogo size={22} />
            </Link>
          </li>
          <li>
            <Link href="/github" target="_blank">
              <GithubLogo size={22} />
            </Link>
          </li>
          <li>
            <Link href="/instagram" target="_blank">
              <InstagramLogo size={22} />
            </Link>
          </li>
          <li>
            <Link href="/twitter" target="_blank">
              <TwitterLogo size={22} />
            </Link>
          </li>
          <li>
            <Link href="/whatsapp" target="_blank">
              <WhatsappLogo size={22} />
            </Link>
          </li>
          <li>
            <Link href="/twitch" target="_blank">
              <TwitchLogo size={22} />
            </Link>
          </li>
        </ul>
        <section className="flex items-center justify-center gap-5">
          <button className="flex items-center justify-center rounded-lg bg-neutral-50 p-2">
            Entre em Contato
          </button>{" "}
          ou{" "}
          <button className="flex items-center justify-center rounded-lg bg-neutral-50 p-2">
            Baixe meu CV
          </button>
        </section>
        <span>Status Discord e spotify</span>
      </header>
      <main>
        <ContentSection title="Sobre">
          Lorem ipsum dolor sit, amet consectetur adipisicing elit. Voluptates
          doloribus accusantium iste dicta quod quibusdam totam officiis
          deleniti. Excepturi consectetur molestiae laudantium aperiam eius,
          molestias facere maiores fugit sit accusamus.
        </ContentSection>
        <ContentSection title="Trabalho">
          Lorem ipsum dolor sit, amet consectetur adipisicing elit. Voluptates
          doloribus accusantium iste dicta quod quibusdam totam officiis
          deleniti. Excepturi consectetur molestiae laudantium aperiam eius,
          molestias facere maiores fugit sit accusamus.
        </ContentSection>
        <ContentSection title="Loja">
          Lorem ipsum dolor sit, amet consectetur adipisicing elit. Voluptates
          doloribus accusantium iste dicta quod quibusdam totam officiis
          deleniti. Excepturi consectetur molestiae laudantium aperiam eius,
          molestias facere maiores fugit sit accusamus.
        </ContentSection>
        <ContentSection title="Blog">
          Lorem ipsum dolor sit, amet consectetur adipisicing elit. Voluptates
          doloribus accusantium iste dicta quod quibusdam totam officiis
          deleniti. Excepturi consectetur molestiae laudantium aperiam eius,
          molestias facere maiores fugit sit accusamus.
        </ContentSection>
      </main>
      <footer>
        <p>&copy; 2023 protifolio by @piluvitu </p>
        <p>Inspired by @justinmfarrugia</p>
      </footer>
    </main>
  );
}
