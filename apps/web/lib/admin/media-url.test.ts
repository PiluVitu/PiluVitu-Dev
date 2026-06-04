/** @jest-environment node */
import { mediaRawUrl } from './media-url'

describe('mediaRawUrl', () => {
  it('maps a /media/ path to the raw GitHub URL', () => {
    expect(mediaRawUrl('/media/capa.png')).toBe(
      'https://raw.githubusercontent.com/PiluVitu/PiluVitu-Dev/main/apps/web/public/media/capa.png',
    )
  })
  it('returns external URLs unchanged', () => {
    expect(mediaRawUrl('https://aride.com.br/logo.png')).toBe(
      'https://aride.com.br/logo.png',
    )
  })
  it('returns legacy root paths unchanged', () => {
    expect(mediaRawUrl('/profile-2.jpg')).toBe('/profile-2.jpg')
  })
  it('returns empty for empty input', () => {
    expect(mediaRawUrl('')).toBe('')
  })
})
