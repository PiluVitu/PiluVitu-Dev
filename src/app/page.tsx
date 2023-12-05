import { ButtonLink } from "@/components/ButtonLink";
import Clock from "@/components/Clock";
import { ContentSection } from "@/components/ContentSection";
import {
  ArrowRight,
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
    <main className="flex max-w-xl flex-col items-center justify-center pb-24 pt-10">
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
      <main className="flex flex-col items-start justify-center gap-6">
        <ContentSection.Root>
          <ContentSection.Title title="Sobre" />
          <ContentSection.Content>
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Sint
              atque provident suscipit voluptates!
            </p>{" "}
            <p>
              Nulla nesciunt expedita culpa molestiae laudantium vitae
              praesentium adipisci, at suscipit perferendis, earum aliquam saepe
              tempore aperiam!
            </p>
          </ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Trabalho" />
          <ContentSection.Content>
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Sint
              atque provident suscipit voluptates!
            </p>{" "}
            <p>
              Nulla nesciunt expedita culpa molestiae laudantium vitae
              praesentium adipisci, at suscipit perferendis, earum aliquam saepe
              tempore aperiam!
            </p>
            <ButtonLink href="#">
              Veja mais <ArrowRight size={18} className="fill-neutral-500" />
            </ButtonLink>
          </ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Loja" />
          <ContentSection.Content>
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Sint
              atque provident suscipit voluptates!
            </p>{" "}
            <p>
              Nulla nesciunt expedita culpa molestiae laudantium vitae
              praesentium adipisci, at suscipit perferendis, earum aliquam saepe
              tempore aperiam!
            </p>
            <ButtonLink href="#">
              Veja mais <ArrowRight size={18} className="fill-neutral-500" />
            </ButtonLink>
          </ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Blog" />
          <ContentSection.Content>
            <p>
              Lorem ipsum dolor sit amet consectetur adipisicing elit. Sint
              atque provident suscipit voluptates!
            </p>{" "}
            <p>
              Nulla nesciunt expedita culpa molestiae laudantium vitae
              praesentium adipisci, at suscipit perferendis, earum aliquam saepe
              tempore aperiam!
            </p>
            <ButtonLink href="#">
              Veja mais <ArrowRight size={18} className="fill-neutral-500" />
            </ButtonLink>
          </ContentSection.Content>
        </ContentSection.Root>
      </main>
      <footer>
        <p>&copy; 2023 protifolio by @piluvitu </p>
        <p>Inspired by @justinmfarrugia</p>
      </footer>
    </main>
  );
}
