import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sobre",
};
export default function About() {
  return (
    <div className="flex h-screen flex-col items-center justify-center">
      <h1>About</h1>
      <a href="https://imgflip.com/i/89jit1">
        <img
          src="https://i.imgflip.com/89jit1.jpg"
          title="made at imgflip.com"
        />
      </a>
    </div>
  );
}
