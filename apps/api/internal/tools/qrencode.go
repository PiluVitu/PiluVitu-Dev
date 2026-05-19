package tools

import qrcode "github.com/skip2/go-qrcode"

func EncodeQR(text string, size int) ([]byte, error) {
	return qrcode.Encode(text, qrcode.Medium, size)
}
