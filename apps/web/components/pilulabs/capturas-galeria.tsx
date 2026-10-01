import { AspectRatio } from '@piluvitu/ui/aspect-ratio'
import Image from 'next/image'
import type { Captura } from '@/lib/pilulabs'

export function CapturasGaleria({ capturas }: { capturas: Captura[] }) {
  if (capturas.length === 0) return null
  return (
    <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {capturas.map((captura) => (
        <li key={captura.arquivo}>
          <a
            href={captura.src}
            target="_blank"
            rel="noopener noreferrer"
            className="border-border focus-visible:ring-ring block overflow-hidden rounded-lg border outline-none focus-visible:ring-2"
          >
            <AspectRatio ratio={16 / 10}>
              <Image
                src={captura.src}
                alt={captura.alt}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-cover"
              />
            </AspectRatio>
          </a>
        </li>
      ))}
    </ul>
  )
}
