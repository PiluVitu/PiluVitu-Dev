# Botaí nas lojas: textos da listagem (pt-BR)

Cada seção `##` é um campo dos formulários das lojas e vai colada como está, sem o título. O `textos.test.ts` confere os limites, e o `manifesto.e2e.ts` confere que toda permissão do manifesto tem justificativa aqui. O que vai em qual loja está no `README.md` desta pasta.

## Nome

Botaí

## Resumo

Gerador de dados fake para formulários (CPF, CNPJ, CEP): bota uma pessoa de teste coerente nos campos da página, num clique ou num atalho.

## Descrição

Botaí, de "bota aí": preenche formulários com uma pessoa brasileira de teste, num clique ou num atalho.

Feito para quem desenvolve e testa formulários brasileiros. O Botaí gera uma pessoa falsa e coerente e escreve os dados nos campos certos da página:

• CPF e CNPJ com dígitos verificadores corretos, além de RG, PIS/NIS e título de eleitor
• CEP real, com rua, bairro, cidade e UF que batem com ele
• nome, data de nascimento, celular, e-mail e senha
• empresa (razão social, nome fantasia e CNPJ)
• cartão de teste documentado da Stripe (número, nome, validade e CVV)

Como usar
• A página inteira: Ctrl+Shift+Y no Windows e no Linux, Alt+Shift+P (⌥⇧P) no Mac, ou o botão "Preencher esta página" do popup. No Firefox para Linux, o atalho é Alt+Shift+P.
• Um campo só: botão direito no campo › Botaí › Inserir › CPF (ou E-mail, CEP…).
• Depois de preencher, o popup mostra quantos campos entraram e leva até os que ficaram de fora.
• A pessoa fica guardada até você pedir outra, para repetir o mesmo cadastro.

Funciona com React, Vue, máscaras (imask, jQuery Mask, react-number-format e outras) e sites que buscam o endereço pelo CEP.

Privacidade: o Botaí só age na aba em que você o aciona, guarda a pessoa de teste no próprio navegador e não envia nada a ninguém.

Cuidados: os dados são fictícios, mas um CPF ou um celular gerado pode pertencer a alguém de verdade. Use só em localhost e em ambientes de teste. A caixa de e-mail gerada é pública.

Código aberto (licença MIT): https://github.com/PiluVitu/PiluVitu-Dev/tree/main/apps/botai

Termos de uso: https://botai.pilutech.com.br/termos

Powered by PiluTech: https://pilutech.com.br

## Propósito único

Preencher formulários web com os dados fictícios de uma pessoa brasileira de teste (CPF, CNPJ, CEP, nome, e-mail e cartão de teste), para quem desenvolve e testa formulários.

## Justificativa: activeTab

Acesso temporário só à aba em que a pessoa aciona o Botaí (ícone, atalho ou menu de contexto), para ler os campos do formulário e escrever os dados de teste. Sem acesso a outras abas nem em segundo plano.

## Justificativa: scripting

Injetar, sob demanda e só na aba liberada pelo activeTab, o script que identifica os campos do formulário e os preenche. Todo o código injetado está no pacote.

## Justificativa: contextMenus

Itens no menu do botão direito: "Preencher esta página" e "Inserir › CPF / E-mail / CEP…", para preencher a página inteira ou um campo específico; "Nova pessoa", para trocar a pessoa de teste por outra; e "Abrir caixa de entrada", que abre numa aba nova a caixa pública do e-mail gerado, em tuamaeaquelaursa.com, site de terceiro.

## Justificativa: storage

Guardar no próprio navegador (storage.local) a pessoa de teste gerada, para reutilizá-la até a pessoa pedir outra. Nada é sincronizado nem enviado.

## Justificativa: menus

Só no Firefox: saber em qual campo a pessoa clicou com o botão direito (menus.getTargetElement), para o "Inserir" escrever no campo certo. Não acrescenta aviso na instalação.

## Código remoto

Não. Todo o código está no pacote; nada é baixado nem avaliado em tempo de execução.

## Dados

Chrome e Edge, aba de privacidade: marcar só "Website content" (conteúdo do site). O Botaí lê os campos do formulário da aba (rótulos, atributos e valor atual) depois de um gesto da pessoa e escreve neles, tudo dentro do navegador. Nada é transmitido, vendido nem usado fora do propósito único. Marcar as três certificações.

Firefox: o manifesto declara data_collection_permissions com required: none; no formulário da AMO, nenhuma categoria de coleta.

## Categoria

Chrome Web Store: Ferramentas para desenvolvedores (Developer Tools). Firefox Add-ons: Web Development, só Firefox para desktop. Edge Add-ons: Developer tools. Opera Add-ons: Developer tools.

## Licença

MIT. A AMO pede na primeira versão listed; as seguintes herdam.

## Endereços

Site do produto e página de suporte: https://botai.pilutech.com.br
Política de privacidade: https://botai.pilutech.com.br/privacidade
Termos de uso: https://botai.pilutech.com.br/termos
E-mail de suporte: pilutechinformatica@gmail.com
Publicador: PiluTech

## Política de privacidade (texto para a AMO)

A AMO pede o texto da política mesmo com a versão hospedada. Copie o texto renderizado de https://botai.pilutech.com.br/privacidade inteiro, inclusive "Este site" (os registros de acesso são do site, não da extensão, e a seção diz isso): a página é a única fonte, para as duas não divergirem.
