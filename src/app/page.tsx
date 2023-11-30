import Clock from "@/components/clock";
import Image from "next/image";
import profileImage from "../../public/zoro-2-1384x752.jpg";

export default function Home() {
  return (
    <div className="pt-10">
      <header>
        <Clock />
        <Image
          src={profileImage}
          alt="Profile Image"
          width={100}
          height={100}
          className="rounded-full"
        ></Image>
      </header>
      <main></main>
      <footer></footer>
    </div>
  );
}
