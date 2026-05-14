package tools

import (
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
)

type JwtRaw struct {
	Header    string `json:"header"`
	Payload   string `json:"payload"`
	Signature string `json:"signature"`
}

type JwtParts struct {
	Header    map[string]interface{} `json:"header"`
	Payload   map[string]interface{} `json:"payload"`
	Signature string                 `json:"signature"`
	Raw       JwtRaw                 `json:"raw"`
}

func DecodeJWT(token string) (*JwtParts, error) {
	parts := strings.Split(strings.TrimSpace(token), ".")
	if len(parts) != 3 {
		return nil, errors.New("token inválido: esperado 3 partes separadas por \".\"")
	}
	headerJSON, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return nil, fmt.Errorf("token inválido: não foi possível decodificar header: %w", err)
	}
	payloadJSON, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return nil, fmt.Errorf("token inválido: não foi possível decodificar payload: %w", err)
	}
	var header, payload map[string]interface{}
	if err := json.Unmarshal(headerJSON, &header); err != nil {
		return nil, fmt.Errorf("token inválido: header não é JSON válido: %w", err)
	}
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return nil, fmt.Errorf("token inválido: payload não é JSON válido: %w", err)
	}
	return &JwtParts{
		Header:    header,
		Payload:   payload,
		Signature: parts[2],
		Raw:       JwtRaw{Header: parts[0], Payload: parts[1], Signature: parts[2]},
	}, nil
}
