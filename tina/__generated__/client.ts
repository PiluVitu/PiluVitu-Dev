import { createClient } from 'tinacms/dist/client'
import { queries } from './types'
export const client = createClient({
  cacheDir:
    '/Users/piluvitu/WWW/PiluVitu-Dev/tina/__generated__/.cache/1776223024506',
  url: 'https://content.tinajs.io/2.2/content/714d183d-7387-4414-bcf6-00cc7146cca1/github/main',
  token: 'dfdf2602c163821a19afbbd5cb5fd29f1f6731ff',
  queries,
})
export default client
