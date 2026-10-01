import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
const page = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url))
createServer((req, res) => {
  const name = req.url === '/' ? 'form.html' : req.url.slice(1)
  try {
    const body = page(name)
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(body)
  } catch {
    res.writeHead(404).end()
  }
}).listen(4599, '127.0.0.1')
