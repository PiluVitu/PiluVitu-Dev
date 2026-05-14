package tools

import "encoding/base64"

func EncodeBase64(text string) string {
	return base64.StdEncoding.EncodeToString([]byte(text))
}

func DecodeBase64(encoded string) (string, error) {
	b, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", err
	}
	return string(b), nil
}
