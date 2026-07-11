# FAB Control PWA

Frontend operacional mobile-first para chão de fábrica, separado do backend Google Apps Script.

## Estado

- Backend oficial: `1.1.2b-operador-visual-normalizacao`
- Frontend: `1.1.3a-pwa-prototipo`
- Regra: o frontend nunca grava diretamente na planilha; toda operação passa pela API.

## Estrutura

- `frontend/`: PWA do operador
- `docs/`: arquitetura, segurança e critérios de aceite

## Segurança

Este repositório não deve conter tokens, senhas, IDs privados ou código do backend de produção. A URL da API é configurada no navegador durante homologação e persistida apenas no dispositivo.

## Execução local

Sirva a pasta `frontend` por HTTP local. Service worker e instalação PWA não funcionam corretamente abrindo o arquivo diretamente pelo sistema de arquivos.

Exemplo:

```bash
python -m http.server 8080 --directory frontend
```

Depois abra `http://localhost:8080`.
