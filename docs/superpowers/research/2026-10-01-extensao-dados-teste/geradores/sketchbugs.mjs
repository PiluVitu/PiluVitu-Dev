import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const bu = require('@brazilian-utils/brazilian-utils')
const { validarRG, dvRGSP } = require('./dist/rg')
const { validarCPF } = require('./dist/cpf')
const { validarCNPJ } = require('./dist/cnpj')
const { validarPIS } = require('./dist/pis')
const { validarTituloEleitor } = require('./dist/titulo-eleitor')
const { senhaAtendeRegrasComuns } = require('./dist/senha')
// P0 values
const P0 = { cpf: '384.529.176-19', rg: '38.452.917-8', cnpj: '47.508.213/0001-92', pis: '127.48391.05-7', titulo: '1047 3826 0108' }
console.log('P0 cpf', validarCPF(P0.cpf), 'bu', bu.isValidCpf(P0.cpf), '9th digit', P0.cpf[10])
console.log('P0 rg (SSP-SP rule)', validarRG(P0.rg), 'correct DV =', dvRGSP([3,8,4,5,2,9,1,7]))
console.log('P0 cnpj', validarCNPJ(P0.cnpj), 'P0 pis', validarPIS(P0.pis), bu.isValidPis(P0.pis), 'P0 titulo', validarTituloEleitor(P0.titulo,'com-excecao-sp-mg'), validarTituloEleitor(P0.titulo,'sem-excecao'), bu.isValidVoterId(P0.titulo))
// sketch título for SP when r1 == 0
const sketchTit = (t, tit) => { let t1 = t.reduce((s, x, i) => s + x * (i + 2), 0) % 11; t1 = t1 === 10 ? 0 : t1; let t2 = (tit[0]*7 + tit[1]*8 + t1*9) % 11; t2 = t2 === 10 ? 0 : t2; return t.join('') + tit.join('') + t1 + t2 }
let found = 0
for (let n = 1; n < 100000 && found < 2; n++) {
  const t = String(n).padStart(8, '0').split('').map(Number)
  const r1 = t.reduce((s, x, i) => s + x * (i + 2), 0) % 11
  if (r1 === 0) { const s = sketchTit(t, [0,1]); console.log('sketch SP título', s, 'bu(com exceção):', bu.isValidVoterId(s), 'sem-excecao:', validarTituloEleitor(s,'sem-excecao')); found++ }
}
// sketch RG rule (DV = r) vs SSP rule
let rgBad = 0; const R = 100000
for (let i = 0; i < R; i++) { const r = Array.from({length:8},()=>Math.floor(Math.random()*10)); const rr = r.reduce((s,x,i)=>s+x*(i+2),0)%11; const s = r.join('') + (rr===10?'X':rr); if (!validarRG(s)) rgBad++ }
console.log('sketch RG invalid under SSP-SP rule:', (rgBad/R*100).toFixed(1)+'%')
// sketch password
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*-'
let pwBad = 0, noDigit = 0, noSym = 0
for (let i = 0; i < R; i++) { const s = Array.from({length:14},()=>chars[Math.floor(Math.random()*chars.length)]).join(''); const ok = /[A-Z]/.test(s)&&/[a-z]/.test(s)&&/\d/.test(s)&&/[!@#$%^&*]/.test(s); if(!ok) pwBad++; if(!/\d/.test(s)) noDigit++; if(!/[!@#$%^&*]/.test(s)) noSym++ }
console.log('sketch senha missing a class:', (pwBad/R*100).toFixed(1)+'%', 'no digit', (noDigit/R*100).toFixed(1)+'%', 'no symbol from !@#$%^&*', (noSym/R*100).toFixed(1)+'%')
// sketch numero vs CEP range
const ranges = { '01310-100': [612,1510,'par'], '04538-133': [3253, 99999, 'impar'], '22021-001': [1662,2172,'par'] }
for (const [cep,[mn,mx,lado]] of Object.entries(ranges)) { let ok=0; for (let n=100;n<2000;n++){ if(n>=mn&&n<=mx&&(lado==='par'?n%2===0:n%2===1)) ok++ } console.log('sketch num 100..1999 in range for', cep, (ok/1900*100).toFixed(1)+'%') }
