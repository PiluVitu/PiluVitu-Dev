package tools

import (
	"encoding/json"
	"strings"
)

type JSONFormatResult struct {
	OK    bool   `json:"ok"`
	Value string `json:"value,omitempty"`
	Error string `json:"error,omitempty"`
}

func FormatJSON(input string, indent int) JSONFormatResult {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	b, err := json.MarshalIndent(parsed, "", strings.Repeat(" ", indent))
	if err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	return JSONFormatResult{OK: true, Value: string(b)}
}

func MinifyJSON(input string) JSONFormatResult {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	b, err := json.Marshal(parsed)
	if err != nil {
		return JSONFormatResult{OK: false, Error: err.Error()}
	}
	return JSONFormatResult{OK: true, Value: string(b)}
}

func ValidateJSON(input string) (bool, string) {
	var parsed interface{}
	if err := json.Unmarshal([]byte(input), &parsed); err != nil {
		return false, err.Error()
	}
	return true, ""
}
