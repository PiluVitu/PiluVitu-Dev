package main

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"

	"github.com/spf13/cobra"

	"github.com/PiluVitu/api/internal/tools"
)

func main() {
	root := &cobra.Command{
		Use:   "piluvitu",
		Short: "Ferramentas de desenvolvimento da PiluVitu",
	}
	root.AddCommand(cpfCmd(), cnpjCmd(), base64Cmd(), jwtCmd(), jsonCmd(), uuidCmd(), qrCmd())
	if err := root.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func cpfCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "cpf", Short: "Operações com CPF"}
	cmd.AddCommand(
		&cobra.Command{
			Use:   "validate <número>",
			Short: "Valida um CPF",
			Args:  cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if tools.ValidarCPF(args[0]) {
					fmt.Println("válido")
				} else {
					fmt.Fprintln(os.Stderr, "inválido")
					os.Exit(1)
				}
			},
		},
		&cobra.Command{
			Use:   "generate",
			Short: "Gera um CPF válido",
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.GerarCPF())
			},
		},
	)
	return cmd
}

func cnpjCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "cnpj", Short: "Operações com CNPJ"}
	cmd.AddCommand(
		&cobra.Command{
			Use:  "validate <número>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				if tools.ValidarCNPJ(args[0]) {
					fmt.Println("válido")
				} else {
					fmt.Fprintln(os.Stderr, "inválido")
					os.Exit(1)
				}
			},
		},
		&cobra.Command{
			Use: "generate",
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.GerarCNPJ())
			},
		},
	)
	return cmd
}

func base64Cmd() *cobra.Command {
	cmd := &cobra.Command{Use: "base64", Short: "Encode/decode Base64"}
	cmd.AddCommand(
		&cobra.Command{
			Use:  "encode <texto>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				fmt.Println(tools.EncodeBase64(args[0]))
			},
		},
		&cobra.Command{
			Use:  "decode <base64>",
			Args: cobra.ExactArgs(1),
			Run: func(cmd *cobra.Command, args []string) {
				result, err := tools.DecodeBase64(args[0])
				if err != nil {
					fmt.Fprintln(os.Stderr, err)
					os.Exit(1)
				}
				fmt.Println(result)
			},
		},
	)
	return cmd
}

func jwtCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "jwt", Short: "Operações com JWT"}
	cmd.AddCommand(&cobra.Command{
		Use:   "decode <token>",
		Short: "Decodifica um JWT (sem verificar assinatura)",
		Args:  cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			parts, err := tools.DecodeJWT(args[0])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			result := tools.FormatJSON(
				fmt.Sprintf(`{"header":%s,"payload":%s}`,
					mustMarshal(parts.Header), mustMarshal(parts.Payload)),
				2)
			fmt.Println(result.Value)
		},
	})
	return cmd
}

func jsonCmd() *cobra.Command {
	var indent int
	cmd := &cobra.Command{Use: "json", Short: "Operações com JSON"}
	formatCmd := &cobra.Command{
		Use:   "format",
		Short: "Formata JSON da stdin",
		Run: func(cmd *cobra.Command, args []string) {
			input, _ := os.ReadFile("/dev/stdin")
			result := tools.FormatJSON(string(input), indent)
			if !result.OK {
				fmt.Fprintln(os.Stderr, result.Error)
				os.Exit(1)
			}
			fmt.Println(result.Value)
		},
	}
	formatCmd.Flags().IntVar(&indent, "indent", 2, "tamanho da indentação")
	cmd.AddCommand(formatCmd)
	return cmd
}

func uuidCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "uuid",
		Short: "Gera UUID v4",
		Run: func(cmd *cobra.Command, args []string) {
			fmt.Println(tools.GenerateUUID())
		},
	}
}

func qrCmd() *cobra.Command {
	var outFile string
	cmd := &cobra.Command{Use: "qr", Short: "Operações com QR code"}

	encodeCmd := &cobra.Command{
		Use:  "encode <texto>",
		Args: cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			png, err := tools.EncodeQR(args[0], 256)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			if outFile != "" {
				os.WriteFile(outFile, png, 0644)
				fmt.Printf("QR salvo em %s\n", outFile)
			} else {
				fmt.Println(base64.StdEncoding.EncodeToString(png))
			}
		},
	}
	encodeCmd.Flags().StringVarP(&outFile, "out", "o", "", "arquivo de saída PNG")

	decodeCmd := &cobra.Command{
		Use:  "decode <arquivo.png>",
		Args: cobra.ExactArgs(1),
		Run: func(cmd *cobra.Command, args []string) {
			imgBytes, err := os.ReadFile(args[0])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			text, err := tools.DecodeQRFromBytes(imgBytes)
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(1)
			}
			fmt.Println(text)
		},
	}

	cmd.AddCommand(encodeCmd, decodeCmd)
	return cmd
}

func mustMarshal(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
