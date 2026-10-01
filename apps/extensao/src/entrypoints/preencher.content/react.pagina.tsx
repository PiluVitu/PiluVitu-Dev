import { useState } from 'react'
import { createRoot } from 'react-dom/client'

const mascararCpf = (valor: string) =>
  valor
    .replace(/\D/g, '')
    .slice(0, 11)
    .replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')

function Formulario() {
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [emailTocado, setEmailTocado] = useState(false)
  const [cpf, setCpf] = useState('')
  return (
    <form>
      <label>
        Nome completo{' '}
        <input
          name="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
        />
      </label>
      <label>
        E-mail{' '}
        <input
          type="email"
          name="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTocado(true)}
        />
      </label>
      <label>
        CPF{' '}
        <input
          name="cpf"
          maxLength={11}
          value={cpf}
          onChange={(e) => setCpf(mascararCpf(e.target.value))}
        />
      </label>
      <label>
        Celular <input name="celular" value="" onChange={() => undefined} />
      </label>
      <output id="estado">
        {JSON.stringify({ nome, email, emailTocado, cpf })}
      </output>
    </form>
  )
}

const raiz = document.getElementById('raiz')
if (raiz) createRoot(raiz).render(<Formulario />)
