package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/PiluVitu/api/internal/httpx"
	"github.com/PiluVitu/api/internal/tools"
)

// ok wraps a successful tool result in the standard envelope.
func ok(w http.ResponseWriter, result any) {
	httpx.Data(w, http.StatusOK, result)
}

// fail emits a standardized error notification with a machine-readable code.
func fail(w http.ResponseWriter, status int, code, msg string) {
	httpx.Error(w, status, code, msg)
}

func readBody(r *http.Request) ([]byte, error) {
	return io.ReadAll(io.LimitReader(r.Body, 1<<20))
}

// CPF

func ValidateCPF(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.ValidarCPF(body.Value))
}

func GenerateCPF(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GerarCPF())
}

// CNPJ

func ValidateCNPJ(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.ValidarCNPJ(body.Value))
}

func GenerateCNPJ(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GerarCNPJ())
}

// Base64

func EncodeBase64(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	ok(w, tools.EncodeBase64(body.Value))
}

func DecodeBase64(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	decoded, err := tools.DecodeBase64(body.Value)
	if err != nil {
		fail(w, http.StatusBadRequest, "decode_failed", err.Error())
		return
	}
	ok(w, decoded)
}

// JWT

func DecodeJWT(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	parts, err := tools.DecodeJWT(body.Value)
	if err != nil {
		fail(w, http.StatusBadRequest, "decode_failed", err.Error())
		return
	}
	ok(w, parts)
}

// JSON

func FormatJSON(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Value  string `json:"value"`
		Indent int    `json:"indent"`
	}
	body.Indent = 2
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	result := tools.FormatJSON(body.Value, body.Indent)
	if !result.OK {
		fail(w, http.StatusBadRequest, "invalid_json", result.Error)
		return
	}
	ok(w, result.Value)
}

func MinifyJSON(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	result := tools.MinifyJSON(body.Value)
	if !result.OK {
		fail(w, http.StatusBadRequest, "invalid_json", result.Error)
		return
	}
	ok(w, result.Value)
}

func ValidateJSON(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	valid, msg := tools.ValidateJSON(body.Value)
	if !valid {
		ok(w, map[string]any{"valid": false, "error": msg})
		return
	}
	ok(w, map[string]any{"valid": true})
}

// UUID

func GenerateUUID(w http.ResponseWriter, r *http.Request) {
	ok(w, tools.GenerateUUID())
}

// QR

func EncodeQR(w http.ResponseWriter, r *http.Request) {
	var body struct{ Value string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	png, err := tools.EncodeQR(body.Value, 256)
	if err != nil {
		fail(w, http.StatusInternalServerError, "qr_encode_failed", err.Error())
		return
	}
	encoded := tools.EncodeBase64(string(png))
	ok(w, encoded)
}

func DecodeQR(w http.ResponseWriter, r *http.Request) {
	var body struct{ Image string }
	b, _ := readBody(r)
	json.Unmarshal(b, &body)
	imgBytes, err := tools.DecodeBase64(body.Image)
	if err != nil {
		fail(w, http.StatusBadRequest, "invalid_base64", "Imagem base64 inválida.")
		return
	}
	text, err := tools.DecodeQRFromBytes([]byte(imgBytes))
	if err != nil {
		fail(w, http.StatusBadRequest, "qr_decode_failed", err.Error())
		return
	}
	ok(w, text)
}
