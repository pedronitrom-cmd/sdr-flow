# SDR Flow

Sistema de fila de ligações e WhatsApp para SDRs, com follow-up, metas, produtividade e painel do gestor.

## Como abrir (Windows)
1. Instale o Node.js (versão LTS) em https://nodejs.org (uma vez só).
2. Descompacte esta pasta e dê dois cliques em `iniciar.bat`.
   - Na primeira vez ele instala o necessário (precisa de internet).
   - Se o Windows perguntar sobre o Firewall, clique em "Permitir acesso" (é isso que deixa o celular entrar).
3. O navegador abre em http://localhost:3000.
4. Entre com `gestor` / `trocar123`. O sistema pede para criar uma senha nova.

## Testar no celular
Com o celular na MESMA rede Wi-Fi do computador, abra no navegador do celular o endereço que aparece na janela preta
("No celular (mesma rede Wi-Fi): http://192.168.x.x:3000"). No iPhone use o Safari, no Android o Chrome.
Depois use "Adicionar à tela inicial" para virar um app.

## Primeiro uso (5 minutos)
1. Aba Equipe: crie as SDRs (usuário e senha provisória; elas trocam no primeiro acesso).
2. Aba Contatos: envie um CSV (nome;telefone;cidade;consumo) ou cole as linhas copiadas do Excel. Os contatos são divididos entre as SDRs.
3. Aba Ajustes: coloque o link do material (PDF/imagem) e ajuste o limite diário e o intervalo do WhatsApp.
4. Aba Mensagens: edite os textos (várias versões por modelo, separadas por uma linha com ---).
5. A SDR entra, toca em Ligar ou WhatsApp, registra o resultado e o próximo contato aparece.

## Como cada botão funciona
- Ligar: abre o discador com o número pronto (no celular liga direto; no notebook depende do "Vincular ao Windows"/Phone Link).
- WhatsApp: abre a conversa com a mensagem pronta (no computador usa o WhatsApp Web; é preciso estar logado nele). Imagem e PDF não anexam sozinhos: use o link do material na mensagem ou anexe na mão.
- Cada SDR envia a mensagem manualmente (toca em enviar), o que protege o número. O sistema aplica o limite diário e o intervalo entre envios.

## Dados e segurança
- Tudo fica no arquivo `data/sdr.db` (faça cópia dele para backup).
- Para uso por mais pessoas fora da sua rede, o sistema precisa ser publicado em um servidor com HTTPS.
- Respeite a LGPD: use bases com relação prévia ou consentimento e atenda pedidos de saída.

## Publicar na internet, 100% gratuito
Combinação: Render (roda o sistema, plano gratuito) + Turso (guarda os dados, plano gratuito). O Render grátis apaga arquivos locais quando reinicia, por isso os dados ficam no Turso.

### 1. Banco de dados no Turso
1. Crie uma conta em turso.tech e entre no painel.
2. Crie um banco de dados (Create Database) com o nome `sdrflow`.
3. Na página do banco, copie a **URL** (começa com `libsql://`).
4. Gere um **token de acesso** do banco (opção de criar/gerar token na página do banco) e copie.

### 2. Código no GitHub
1. Crie um repositório privado `sdr-flow` e envie o conteúdo desta pasta (não envie `node_modules` nem `data`).

### 3. Sistema no Render
1. Crie conta em render.com entrando com o GitHub.
2. New > Web Service e escolha o repositório `sdr-flow`.
3. Preencha: Language `Node`, Build Command `npm install`, Start Command `node server.js`, Instance Type **Free**.
4. Em Environment Variables, adicione `TURSO_DATABASE_URL` (a URL do passo 1) e `TURSO_AUTH_TOKEN` (o token).
5. Clique em Create Web Service. Quando aparecer Live, o endereço `https://sdr-flow-xxxx.onrender.com` é o link das SDRs.
6. Entre com `gestor` / `trocar123` e troque a senha na hora.

### Limite do plano gratuito
O Render grátis "dorme" depois de 15 minutos sem uso e leva cerca de 1 minuto para acordar no primeiro acesso. Para evitar, crie um monitor gratuito em uptimerobot.com apontando para `https://SEU-LINK/api/ping` a cada 5 minutos.
