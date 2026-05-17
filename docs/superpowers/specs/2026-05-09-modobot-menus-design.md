# Design: Sistema ModoBot + Auditoria Completa de Menus

**Data:** 2026-05-09  
**Âmbito:** Sistema de modo admin-only por grupo com whitelist + correção e completação de todos os menus

---

## 1. Sistema ModoBot (admin-only por grupo)

### 1.1 Schema — `defaultGroupDB()`

Adicionar campo `modoBot` ao grupo:

```js
modoBot: {
  apenasAdmins: false,   // boolean — modo admin-only ativo
  liberados: []          // string[] — comandos sempre acessíveis a membros
}
```

### 1.2 Novos comandos (em `src/commands/admin.js` → `handleAdmin`)

| Comando | Permissão | Ação |
|---|---|---|
| `!modobot admin` | admin/owner | Ativa modo admin-only |
| `!modobot todos` | admin/owner | Desativa modo (todos usam) |
| `!liberar <cmd>` | admin/owner | Adiciona comando à whitelist |
| `!restringir <cmd>` | admin/owner | Remove comando da whitelist |
| `!liberados` | admin/owner | Lista comandos liberados para membros |

### 1.3 Lógica no `handler.js`

Inserir **antes** do dispatch principal (switch/default), após a extração de `command` e `isAdmin`/`isOwner`:

```js
// Verificar modo admin-only
if (isGroup) {
  const gdb = getGroupDB(from)
  const modoBot = gdb.modoBot ?? { apenasAdmins: false, liberados: [] }
  if (modoBot.apenasAdmins && !isAdmin && !isOwner) {
    if (!modoBot.liberados.includes(command)) return  // silêncio total
  }
}
```

### 1.4 Mensagens (msgs.js)

```
modobot.ativado       = "🔒 Modo admin ativado. Membros não podem usar comandos."
modobot.desativado    = "🔓 Modo aberto. Todos os membros podem usar comandos."
modobot.liberado      = "✅ Comando *{cmd}* liberado para membros."
modobot.restringido   = "🚫 Comando *{cmd}* restringido a admins."
modobot.jaNaLista     = "⚠️ Este comando já está na lista."
modobot.naoNaLista    = "⚠️ Este comando não está na lista."
modobot.liberados     = "📋 Comandos liberados para membros:\n{lista}"
modobot.semLiberados  = "📋 Nenhum comando liberado para membros."
modobot.usoModobot    = "ℹ️ Uso: !modobot admin | !modobot todos"
```

### 1.5 Secção no `menuAdmin()`

```
╔═「 🔑 MODO BOT 」
║  !modobot admin — Só admins usam o bot
║  !modobot todos — Todos usam o bot
║  !liberar <cmd> — Liberar cmd para membros
║  !restringir <cmd> — Bloquear cmd a admins
║  !liberados — Ver comandos liberados
╚═══════════════════
```

---

## 2. Auditoria de Menus — Comandos em Falta

### 2.1 `menuFun` — Adicionar

**Secção ROLEPLAY:** adicionar `julgamento`  
```
║  !julgamento [@user] — Julgamento surpresa 🔨
```

**Secção OUTROS:** adicionar `cara` e `curiosidade`  
```
║  !cara — Cara ou coroa (só cara)
║  !curiosidade — Facto curioso 🤓
```

### 2.2 `menuSistemas` — Adicionar nova secção

**Nova secção VERDADE OU MITO:**
```
╔═「 🤔 VERDADE OU MITO 」
║  !verdadeomito on/off — Toggle
║  !verdade / !mito — Responder
║  !torneio — Iniciar torneio
╚═══════════════════
```

**Nova secção DIVISÃO DE EQUIPAS:**
```
╔═「 ⚔️ DIVISÃO DE EQUIPAS 」
║  !dividir [n] — Dividir grupo em n equipas
╚═══════════════════
```

### 2.3 `menuRpg` — Adicionar comandos em falta

**Secção INTERAÇÃO:** adicionar `apostar` e `duelo`
```
║  !apostar [valor] — Apostar moedas 🎰
║  !duelo @membro — Duelo 1v1 ⚔️
```

**Secção SALDO & PERFIL:** adicionar `banco`
```
║  !banco — Ver saldo bancário
```

### 2.4 `menuAdmin` — Sorteios — Adicionar comandos em falta

**Secção SORTEIOS:**
```
║  !cancelarsorteio [id] — Cancelar sorteio
║  !participantes [id] — Ver participantes
```

### 2.5 `menuJogos` — Adicionar nova secção

**Nova secção TRADUTOR:**
```
╔═「 🌍 TRADUTOR 」
║  !tradutorconfig on/off — Toggle auto-tradução quiz
╚═══════════════════
```

### 2.6 `menuPrincipal` — Adicionar comandos utilitários em falta

Na linha de rodapé, adicionar `ping`, `dono`, `criador`:
```
ℹ️ !info  •  📚 !ajuda  •  🏓 !ping  •  👤 !dono
```

---

## 3. Ficheiros a alterar

| Ficheiro | Alteração |
|---|---|
| `src/utils.js` | `defaultGroupDB()` — adicionar campo `modoBot` |
| `src/handler.js` | Bloco de verificação modoBot antes do dispatch |
| `src/commands/admin.js` | Casos `modobot`, `liberar`, `restringir`, `liberados` |
| `src/commands/menus.js` | Reescrita completa com todos os comandos em falta |
| `src/msgs.js` | Strings `modobot.*` |

---

## 4. Comportamento e Edge Cases

- **Comandos internos** (`menu`, `menuadmin`, etc.) nunca são bloqueados pelo modoBot — verificação só corre para o `command` normalizado que chega ao dispatch.
- **`!liberados` sem nada na lista** → mensagem informativa, não erro.
- **`!liberar` de comando que não existe** → aceita na mesma (admin pode pré-configurar antes de o comando existir, e o bot nunca valida nomes de comandos em runtime).
- **Modo admin desativado (`todos`)** → lista de liberados fica preservada no DB para reutilização futura.
- **Owner** é sempre isento, independentemente do modo.
