import { execFileSync, spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

export interface RepoDeTeste {
  trabalho: string
  git: (...args: string[]) => string
  gitDaOrigem: (...args: string[]) => string
  escreverVersao: (versao: string) => void
  argsDoGh: () => string[] | null
  rodar: (
    script: string,
    args?: string[],
    extra?: Record<string, string>,
  ) => { status: number | null; saida: string }
  fechar: () => void
}

// Git isolado da configuração de quem roda (assinatura de commit, hooks, aliases).
const ENV_GIT = {
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Teste',
  GIT_AUTHOR_EMAIL: 'teste@exemplo.com',
  GIT_COMMITTER_NAME: 'Teste',
  GIT_COMMITTER_EMAIL: 'teste@exemplo.com',
}

export function criarRepoDeTeste(versao: string): RepoDeTeste {
  const pasta = mkdtempSync(path.join(tmpdir(), 'botai-repo-'))
  const origem = path.join(pasta, 'origem.git')
  const trabalho = path.join(pasta, 'trabalho')
  const bin = path.join(pasta, 'bin')
  const env = { PATH: `${bin}:${process.env.PATH}`, HOME: pasta, ...ENV_GIT }
  const executar = (cwd: string, args: string[]) =>
    execFileSync('git', args, { cwd, env, encoding: 'utf8' }).trim()

  mkdirSync(bin)
  writeFileSync(
    path.join(bin, 'gh'),
    `#!/usr/bin/env bash\nprintf '%s\\n' "$@" > "${path.join(pasta, 'gh.args')}"\n`,
    { mode: 0o755 },
  )
  execFileSync('git', ['init', '--quiet', '--bare', '-b', 'main', origem], {
    env,
  })
  execFileSync('git', ['clone', '--quiet', origem, trabalho], { env })
  const escreverVersao = (v: string) => {
    mkdirSync(path.join(trabalho, 'apps/botai'), { recursive: true })
    writeFileSync(
      path.join(trabalho, 'apps/botai/package.json'),
      `${JSON.stringify({ name: '@pilutech/botai', version: v, private: true }, null, 2)}\n`,
    )
  }
  escreverVersao(versao)
  executar(trabalho, ['switch', '--quiet', '-c', 'main'])
  executar(trabalho, ['add', '.'])
  executar(trabalho, ['commit', '--quiet', '-m', 'inicial'])
  executar(trabalho, ['push', '--quiet', '-u', 'origin', 'main'])

  return {
    trabalho,
    git: (...args) => executar(trabalho, args),
    gitDaOrigem: (...args) => executar(origem, args),
    escreverVersao,
    argsDoGh: () => {
      const arquivo = path.join(pasta, 'gh.args')
      return existsSync(arquivo)
        ? readFileSync(arquivo, 'utf8').trimEnd().split('\n')
        : null
    },
    rodar: (script, args = [], extra = {}) => {
      const r = spawnSync('bash', [script, ...args], {
        cwd: trabalho,
        env: { ...env, ...extra },
        encoding: 'utf8',
      })
      return { status: r.status, saida: `${r.stdout}${r.stderr}` }
    },
    fechar: () => rmSync(pasta, { recursive: true, force: true }),
  }
}
