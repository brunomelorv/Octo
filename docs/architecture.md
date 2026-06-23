# Arquitetura do Sistema - Lead Analytics

Este documento descreve a arquitetura geral do projeto Lead Analytics.

## Visão Geral

O Lead Analytics é uma solução web fullstack projetada para análise de leads, com foco em 3 abas principais:
1. **Marketing Geral**
2. **PitchYES**
3. **Análise de Ligações**

## Componentes

- **Frontend**: HTML5, Vanilla CSS (customizado/moderno) e Vanilla Javascript para manipulação do DOM e comunicação assíncrona.
- **Backend API**: Python com FastAPI para alta performance, fornecendo endpoints de processamento de arquivos XLSX, gerenciamento de leads e integrações.
- **Integração Backend**: Databricks (análise de dados de ligações/marketing) e Meta API (Mini CRM para leads e campanhas).

## Fluxo de Dados

1. O usuário realiza upload de um arquivo XLSX via frontend.
2. O backend processa o arquivo temporariamente ou o envia/persiste para análise.
3. Dashboards e visualizações consomem endpoints da API que processam e cruzam dados do Databricks e CRM.
