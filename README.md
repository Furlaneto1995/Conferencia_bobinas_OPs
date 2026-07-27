# Conferência de Bobinas (por Setor)

App de conferência de bobinas por código de barras.

## Diferença desta versão
A importação da planilha usa a **coluna de SETOR** (coluna B / cabeçalho SETOR), não mais ETAPA numérica.

### Tipos de conferência
| Tipo no app | Valor na coluna SETOR |
|---|---|
| Bases | IMPRESSÃO |
| Capas | LAMINAÇÃO |
| Refiladeira | REFILADEIRA |
| Corte e solda | CORTE E SOLDA |

## Arquivos principais
- `index.html`
- `sw.js`
- `manifest.json`
- `html5-qrcode.local.js`
- `jszip.min.js`
- `icon-192.png` / `icon-512.png`

## Publicação (GitHub Pages)
1. Crie o repositório no GitHub
2. Envie estes arquivos na branch `main`
3. Settings → Pages → Deploy from branch `main` / root
