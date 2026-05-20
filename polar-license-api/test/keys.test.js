import { describe, it, expect } from 'vitest'
import { gerarChave, validarChave } from '../src/keys.js'

const SECRET = 'test-secret-123'

describe('gerarChave', () => {
  it('gera chave com prefixo POLAR-', async () => {
    const { key } = await gerarChave(30, 'TestCliente', SECRET)
    expect(key).toMatch(/^POLAR-[A-Za-z0-9_-]+\.[a-f0-9]{24}$/)
  })

  it('keyId tem 8 chars hex', async () => {
    const { keyId } = await gerarChave(30, 'x', SECRET)
    expect(keyId).toMatch(/^[a-f0-9]{8}$/)
  })
})

describe('validarChave', () => {
  it('valida chave gerada', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const r = await validarChave(key, SECRET)
    expect(r.valida).toBe(true)
    expect(r.cliente).toBe('Ze')
    expect(r.diasRestantes).toBeGreaterThan(28)
  })

  it('rejeita chave com secret errado', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const r = await validarChave(key, 'wrong-secret')
    expect(r.valida).toBe(false)
    expect(r.motivo).toBe('chave inválida ou modificada')
  })

  it('rejeita chave adulterada', async () => {
    const { key } = await gerarChave(30, 'Ze', SECRET)
    const tampered = key.slice(0, -4) + 'xxxx'
    const r = await validarChave(tampered, SECRET)
    expect(r.valida).toBe(false)
  })

  it('rejeita formato inválido', async () => {
    const r = await validarChave('nao-e-uma-chave', SECRET)
    expect(r.valida).toBe(false)
    expect(r.motivo).toBe('formato inválido')
  })

  it('aceita cliente com caracteres Unicode', async () => {
    const { key } = await gerarChave(7, 'João & Ângela', SECRET)
    const r = await validarChave(key, SECRET)
    expect(r.valida).toBe(true)
    expect(r.cliente).toBe('João & Ângela')
  })
})
