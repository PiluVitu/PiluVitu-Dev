import QRCode from 'qrcode'

export async function encodeQRPng(text: string): Promise<Blob> {
  const dataUrl = await QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
  })
  const res = await fetch(dataUrl)
  return res.blob()
}

export async function encodeQRSvg(text: string): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 2,
  })
}
