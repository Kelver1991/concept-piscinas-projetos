# Concept Piscinas - Fila de Projetos

Sistema simples para organizar solicitações de projetos entre comercial e
arquitetura da Concept Piscinas.

## Como usar localmente

1. Abra `index.html` no navegador.
2. Entre com uma das senhas de perfil.
3. O vendedor preenche a solicitação inicial do cliente.
4. A solicitação entra automaticamente na fila por ordem de cadastro.
5. O arquiteto escolhe o próprio nome, informa a estimativa e clica em
   `Pegar projeto`.
6. A arquitetura avança o card pelas etapas até marcar como entregue.

Sem configuração online, os dados ficam salvos apenas no navegador usado.

## Perfis de acesso

O acesso usa email e senha. No primeiro acesso, a pessoa informa nome, email,
senha e função desejada. O cadastro fica pendente até o ADM liberar.

- Comercial: cadastra e acompanha solicitações.
- Arquitetura: assume e movimenta projetos.
- ADM: ve tudo, aprova usuarios, exporta/importa backup e pode excluir registros.

ADM inicial: `kelvermendes1991@gmail.com`.

## Como deixar online para celular e outras máquinas

### 1. Criar banco gratuito no Supabase

1. Acesse `https://supabase.com`.
2. Crie uma conta gratuita.
3. Crie um novo projeto.
4. Abra `SQL Editor`.
5. Copie o conteudo de `database.sql`.
6. Execute o SQL.

### 2. Configurar o sistema

1. No Supabase, abra `Project Settings` > `API`.
2. Copie a `Project URL`.
3. Copie a chave `anon public`.
4. Abra `config.js`.
5. Preencha assim:

```js
window.APP_CONFIG = {
  companyName: "Concept Piscinas",
  supabaseUrl: "SUA_PROJECT_URL",
  supabaseAnonKey: "SUA_ANON_PUBLIC_KEY",
};
```

### 3. Publicar o site

Publique a pasta `fila-projetos-piscinas` em um serviço de site estático:

- GitHub Pages
- Netlify
- Vercel

Depois disso, qualquer vendedor, gerente ou arquiteto pode abrir o link pelo
computador ou celular.

## Equipe cadastrada

Comercial:

- Barbara
- Anderson
- Ingrind
- Debora
- Vanessa
- Felipe

Gerente:

- Luana

Arquitetura:

- Gustavo
- Kalebe
- Nara

## Etapas do projeto

1. Projeto inicial (orçamento)
2. Projeto de paginação
3. Projeto de dispositivos
4. Projeto de laminação
5. Pronto de implantação
6. Projeto hidráulica
7. Projeto elétrica

## Arquivos principais

- `index.html`: estrutura das telas.
- `styles.css`: visual responsivo.
- `script.js`: regras da fila, etapas, histórico e persistência.
- `config.js`: configuração da Concept Piscinas e do Supabase.
- `database.sql`: estrutura do banco online gratuito.
- `assets/`: logos da Concept usadas na interface.
