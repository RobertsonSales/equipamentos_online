# Patrimônio — Dashboard + CRUD sobre Google Sheets (v2)

Hospedagem: **GitHub + Vercel**, com URL e token do Apps Script guardados **só** nas variáveis de ambiente da Vercel.

## Estrutura do repositório

```text
patrimonio-dashboard/
├── api/
│   └── patrimonio.js     # função servidor (proxy) — lê APPS_SCRIPT_URL e APPS_SCRIPT_TOKEN
├── index.html            # aplicação (HTML/CSS/JS) — sem nenhuma chave no código
├── vercel.json           # cabeçalhos de segurança (CSP, HSTS…) e config. da função
├── package.json          # identifica o projeto Node na Vercel (sem dependências)
├── .env.example          # modelo das variáveis (sem valores reais)
├── .gitignore            # impede commit de .env / .vercel
├── README.md
└── apps-script/
    └── Code.gs           # cópia de referência da API (colada no Apps Script, não roda na Vercel)
```

## Variáveis de ambiente (Vercel › Settings › Environment Variables)

| Nome | Obrigatória | Valor |
|---|---|---|
| `APPS_SCRIPT_URL` | Sim | URL do Web App terminada em `/exec` |
| `APPS_SCRIPT_TOKEN` | Sim | Mesmo valor da propriedade `API_TOKEN` do Apps Script |
| `ALLOWED_ORIGIN` | Não | Domínio oficial, ex. `https://patrimonio-dashboard.vercel.app` |

Marque Production, Preview e Development e faça **Redeploy** após salvar.

## Fluxo

```text
Navegador ──/api/patrimonio──▶ Função Vercel (+ token) ──▶ Apps Script ──▶ Planilha
```

Sem variáveis configuradas (ou abrindo o arquivo localmente), o app roda em **modo demonstração**.

Consulte o documento "Patrimônio – Implantação" para o passo a passo completo.
