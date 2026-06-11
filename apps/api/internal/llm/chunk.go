package llm

import "strings"

type blockKind int

const (
	prose       blockKind = iota // texto que vai pro LLM (parágrafos, títulos, listas)
	passthrough                  // mantido verbatim (código, tabelas, HTML/JSX, citações, imagens, linhas em branco)
)

// block é um pedaço contíguo do markdown. A concatenação de todos os `text`
// reproduz a entrada original byte a byte.
type block struct {
	kind blockKind
	text string
}

// splitBlocks divide o markdown em blocos ordenados, separando prosa do que
// não deve ser corrigido. Blocos de código cercado (```) são atômicos (linhas
// em branco internas não os quebram). Invariante: join(blocks.text) == input.
func splitBlocks(input string) []block {
	lines := strings.SplitAfter(input, "\n") // mantém o \n no fim de cada linha
	var blocks []block
	var cur []string
	curBlank := false

	flush := func() {
		if len(cur) == 0 {
			return
		}
		text := strings.Join(cur, "")
		k := prose
		if curBlank || classifyPassthrough(cur) {
			k = passthrough
		}
		blocks = append(blocks, block{kind: k, text: text})
		cur = nil
		curBlank = false
	}

	i := 0
	for i < len(lines) {
		line := lines[i]
		trimmed := strings.TrimSpace(line)

		// Bloco de código cercado: passthrough atômico até o fechamento.
		if strings.HasPrefix(trimmed, "```") {
			flush()
			fence := []string{line}
			i++
			for i < len(lines) {
				fence = append(fence, lines[i])
				closed := strings.HasPrefix(strings.TrimSpace(lines[i]), "```")
				i++
				if closed {
					break
				}
			}
			blocks = append(blocks, block{kind: passthrough, text: strings.Join(fence, "")})
			continue
		}

		isBlank := trimmed == ""
		if len(cur) > 0 && isBlank != curBlank {
			flush()
		}
		curBlank = isBlank
		cur = append(cur, line)
		i++
	}
	flush()
	return blocks
}

// classifyPassthrough decide, pela primeira linha não-vazia, se um bloco de
// conteúdo é não-prosa (tabela, HTML/JSX, citação ou imagem).
func classifyPassthrough(lines []string) bool {
	var first string
	for _, l := range lines {
		if t := strings.TrimSpace(l); t != "" {
			first = t
			break
		}
	}
	switch {
	case first == "": // só espaço em branco
		return true
	case strings.HasPrefix(first, "|"): // tabela
		return true
	case strings.HasPrefix(first, "<"): // HTML/JSX
		return true
	case strings.HasPrefix(first, ">"): // citação
		return true
	case strings.HasPrefix(first, "!["): // imagem
		return true
	}
	return false
}

// restoreEdges reanexa o espaço em branco de borda do bloco original ao texto
// corrigido (que o chat já devolve trimado), preservando o espaçamento entre
// blocos na remontagem.
func restoreEdges(original, corrected string) string {
	lead := original[:len(original)-len(strings.TrimLeft(original, " \t\r\n"))]
	trail := original[len(strings.TrimRight(original, " \t\r\n")):]
	return lead + corrected + trail
}
