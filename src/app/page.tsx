import { ButtonLink } from "@/components/ButtonLink";
import Clock from "@/components/Clock";
import { ContentSection } from "@/components/ContentSection";
import {
  AppWindow,
  ArrowRight,
  EnvelopeSimple,
  FilePdf,
  FilmStrip,
  GithubLogo,
  InstagramLogo,
  LinkedinLogo,
  ListChecks,
  TwitchLogo,
  TwitterLogo,
  WhatsappLogo,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import Link from "next/link";
import landingPage from "../../public/images/LandingPageIcon.png";
import landingPageOptimization from "../../public/images/LandingPageOptimizationIcon.png";
import octopost from "../../public/images/octopost.webp";
import profileImage from "../../public/images/profile-2.webp";
import rocketMovies from "../../public/images/rocket-movies.webp";
import { ItemSimple } from "../components/ItemSimple/index";
import profile from "../mock/profile.json";

export default function Home() {
  return (
    <main className="flex max-w-xl flex-col items-center justify-center gap-10 pb-24 pt-10 max-sm:mx-2 max-sm:pb-40">
      <header className="flex w-full flex-col items-center justify-center gap-4">
        <Clock />
        <section className="flex flex-col items-center justify-center pt-3">
          <Image
            src={profileImage}
            alt="Profile Image"
            width={100}
            height={100}
            className="mb-4 rounded-full"
          ></Image>
          <h1 className="text-2xl">{profile.name}</h1>
          <h2 className="text-xl text-neutral-400">{profile.role}</h2>
        </section>
        <h2 className="animate-pulse rounded-md border-2 border-[#1972a4] p-2 text-sm text-neutral-400">
          Disponível para novas oportunidades
        </h2>
        <ul className="flex items-center justify-center gap-7 py-4">
          <li>
            <Link href="/linkedin" target="_blank">
              <LinkedinLogo size={24} />
            </Link>
          </li>
          <li>
            <Link href="/github" target="_blank">
              <GithubLogo size={24} />
            </Link>
          </li>
          <li>
            <Link href="/instagram" target="_blank">
              <InstagramLogo size={24} />
            </Link>
          </li>
          <li>
            <Link href="/twitter" target="_blank">
              <TwitterLogo size={24} />
            </Link>
          </li>
          <li>
            <Link href="/zap" target="_blank">
              <WhatsappLogo size={24} />
            </Link>
          </li>
          <li>
            <Link href="/twitch" target="_blank">
              <TwitchLogo size={22} />
            </Link>
          </li>
        </ul>
        <section className="flex w-full items-center justify-center gap-5 max-lg:flex-col max-lg:gap-2">
          <ButtonLink href="mailto:pilutechinformatica@gmail.com">
            Entre em Contato <EnvelopeSimple size={20} />
          </ButtonLink>{" "}
          ou{" "}
          <ButtonLink href="https://drive.google.com/uc?export=download&id=1aoHtajache8u334A1_m95fRsCcfPpAHr">
            Baixe meu CV <FilePdf size={20} />
          </ButtonLink>
        </section>
        <span className="text-neutral-400">{profile.localy}</span>
      </header>
      <main className="flex flex-col items-start justify-center gap-6 max-md:gap-8">
        <ContentSection.Root>
          <ContentSection.Title title="Sobre" />
          <ContentSection.Content>{profile.bio}</ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Trabalho" />
          <ContentSection.Content>
            <ContentSection.ImageContent
              title="Rocket Movies"
              path={rocketMovies}
              url="https://rocket-movies.piluvitu.dev/"
            >
              <FilmStrip size={20} className="fill-neutral-400" />
            </ContentSection.ImageContent>
            <ContentSection.ImageContent
              title="Octopost"
              path={octopost}
              url="https://github.com/devhatt/octopost"
            >
              <AppWindow size={20} className="fill-neutral-400" />
            </ContentSection.ImageContent>
            <ContentSection.ImageContent
              title="ToDo"
              path={octopost}
              url="https://todo.piluvitu.dev/"
            >
              <ListChecks size={20} className="fill-neutral-400" />
            </ContentSection.ImageContent>
            <ButtonLink href="/work" redirect={false}>
              Veja mais <ArrowRight size={18} className="fill-neutral-500" />
            </ButtonLink>
          </ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Loja" />
          <ContentSection.Content>
            <ItemSimple.Root>
              <ItemSimple.Image url={landingPage} title="Icone de Teste" />
              <ItemSimple.Title
                title="Desenvolvimento de LandingPages"
                subtitle="As melhores landing pages para seu negocio, seja ele uma loja ou produto digital"
              />
              <ItemSimple.Text type="price" text={1000} />
            </ItemSimple.Root>
            <ItemSimple.Root>
              <ItemSimple.Image
                url={landingPageOptimization}
                title="Icone de Teste"
              />
              <ItemSimple.Title
                title="Otimização de Sites"
                subtitle="Otimizando o seu site para uma melhor experiência de usuário e velocidade de carregamento"
              />
              <ItemSimple.Text type="price" text={500} />
            </ItemSimple.Root>
            <ButtonLink href="/store" redirect={false}>
              Veja mais <ArrowRight size={18} className="fill-neutral-500" />
            </ButtonLink>
          </ContentSection.Content>
        </ContentSection.Root>
        <ContentSection.Root>
          <ContentSection.Title title="Blog" />
          <ContentSection.Content>
            <ItemSimple.Root>
              <ItemSimple.Title
                title="Como TypeScript revolucionou minha maneira de programar e acelerou meu processo de aprendizagem no js vanilla"
                tags={["Web", "TypeScript"]}
              />
              <ItemSimple.Text type="default" text="10/11/2000" />
            </ItemSimple.Root>
            <ButtonLink href="/blog" redirect={false}>
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
