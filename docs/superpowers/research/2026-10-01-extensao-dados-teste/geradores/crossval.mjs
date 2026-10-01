import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { sfc32 } = require('./dist/prng')
const { gerarPessoa } = require('./dist/pessoa')
const { gerarTituloEleitor } = require('./dist/titulo-eleitor')
const { gerarRG } = require('./dist/rg')
const bu = require('@brazilian-utils/brazilian-utils')
import cv from 'card-validator'
import { parsePhoneNumberFromString } from 'libphonenumber-js/max'
import fs from 'fs'
const N = 2000, fails = {}
const fail = (k, v) => { (fails[k] ??= []).push(v) }
const out = []
const gateways = ['stripe','adyen','mercadopago','pagarme','pagbank']
for (let i = 0; i < N; i++) {
  const g = gateways[i % 5]
  const p = gerarPessoa(sfc32(i, i * 31, i * 17 + 3, 0x9e3779b9 ^ i), '2026-10-01', { cartao: { gateway: g, bandeiras: ['visa','mastercard','amex','elo','hipercard'] } })
  out.push(p)
  if (!bu.isValidCpf(p.cpf)) fail('cpf', p.cpf)
  if (!bu.isValidCnpj(p.empresa.cnpj)) fail('cnpj', p.empresa.cnpj)
  if (!bu.isValidPis(p.pis)) fail('pis', p.pis)
  if (!bu.isValidVoterId(p.tituloEleitor)) fail('titulo-bu', p.tituloEleitor)
  if (!bu.isValidMobilePhone(p.celular.formatado)) fail('cel-bu', p.celular.formatado)
  const ph = parsePhoneNumberFromString(p.celular.e164)
  if (!ph?.isValid() || ph.getType() !== 'MOBILE') fail('cel-lpn', p.celular.e164)
  if (!bu.isValidCep(p.endereco.cep)) fail('cep', p.endereco.cep)
  if (!bu.isValidEmail(p.email.endereco)) fail('email', p.email.endereco)
  const c = cv.number(p.cartao.numero)
  if (!c.isValid) fail('cartao', p.cartao.numero)
  const ex = cv.expirationDate(p.cartao.validade)
  if (!ex.isValid) fail('validade', p.cartao.validade)
  if (!cv.cvv(p.cartao.cvv, p.cartao.bandeira === 'amex' ? 4 : 3).isValid) fail('cvv', p.cartao.cvv + ' ' + p.cartao.bandeira)
  if (p.nascimento.idade < 18 || p.nascimento.idade > 65) fail('idade', p.nascimento)
  if (p.cartao.titular.length > 26) fail('titular>26', p.cartao.titular)
}
// SP/MG titulos stress (both rules)
const tit = []
for (let i = 0; i < 5000; i++) { const r = sfc32(i, 1, 2, 3); for (const uf of ['SP','MG']) { const t = gerarTituloEleitor(r, uf); tit.push(t); if (!bu.isValidVoterId(t)) fail('titulo-spmg-bu', t) } }
const rgs = []; for (let i = 0; i < 2000; i++) rgs.push(gerarRG(sfc32(i, 9, 9, 9)))
fs.writeFileSync('pessoas.json', JSON.stringify({ pessoas: out.map(p => ({ cpf: p.cpf, cnpj: p.empresa.cnpj, pis: p.pis, titulo: p.tituloEleitor })), titulosSPMG: tit }))
console.log('fails:', Object.fromEntries(Object.entries(fails).map(([k, v]) => [k, [v.length, v.slice(0, 3)]])))
console.log('ok checks over', N, 'people +', tit.length, 'SP/MG títulos')
const ufs = new Set(out.map(p => p.endereco.uf)); console.log('UFs covered', ufs.size)
const idades = out.map(p => p.nascimento.idade); console.log('idade min/max', Math.min(...idades), Math.max(...idades))
console.log('expiry gateways sample', [...new Set(out.map(p => p.cartao.gateway + ':' + p.cartao.validade))].slice(0, 12).join(' '))
