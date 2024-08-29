import { ImageResponse } from 'next/og'

export const runtime = 'edge'

// Image metadata
export const alt = 'piluvitu.dev DevOps Engineer'
export const size = {
  width: 1200,
  height: 630,
}

export const contentType = 'image/png'

// Image generation
export default async function Image() {
  return new ImageResponse(
    (
      // ImageResponse JSX element
      <div tw="flex flex-col w-full h-full items-center justify-center bg-[#3a3f41]">
        <div tw="flex w-full">
          <div tw="flex flex-col items-center justify-center w-full">
            <h2 tw="text-3xl sm:text-4xl font-bold tracking-tight text-white">
              piluvitu.dev
            </h2>
            <h3 tw="text-xl sm:text-2xl font-bold tracking-tight text-zinc-300">
              <strong tw="text-lime-500">DevOps</strong> Engineer
            </h3>
          </div>
        </div>
      </div>
    ),
    // ImageResponse options
    {
      // For convenience, we can re-use the exported opengraph-image
      // size config to also set the ImageResponse's width and height.
      ...size,
    },
  )
}
