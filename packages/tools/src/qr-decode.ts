// Thin wrapper kept separate from @zxing/browser import so lib/tools stays importable in Node/tests.
// The actual @zxing/browser camera integration lives in components/tools/qr-reader-tool.tsx.
export type QrDecodeResult = { text: string } | null

export function decodeQRFromImageData(imageData: ImageData): QrDecodeResult {
  // jsqr-style decode — used for file/image input (not live camera).
  // Live camera decode is handled via BrowserMultiFormatReader in the React component.
  // This function exists to make the interface explicit; actual jsqr usage can be
  // swapped in here without touching the component.
  void imageData
  return null
}
