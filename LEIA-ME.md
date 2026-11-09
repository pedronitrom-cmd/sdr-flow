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

## Publicar na internet (para as SDRs usarem de qualquer lugar)
O banco é um arquivo, então o serviço escolhido precisa de um disco persistente (sem ele os dados somem a cada reinicialização).

### Render (mais simples)
1. Crie uma conta em render.com e um repositório no GitHub com o conteúdo desta pasta.
2. No Render: New > Blueprint, escolha o repositório. O arquivo `render.yaml` já configura o serviço e o disco.
3. Quando terminar, o Render mostra o endereço https://sdr-flow-xxxx.onrender.com. É esse o link das SDRs.
4. Entre com `gestor` / `trocar123` e troque a senha logo no primeiro acesso.

### Railway ou outro serviço
- Crie o serviço a partir do repositório (ou do `Dockerfile`), adicione um volume/disco e defina a variável `DB_PATH` apontando para dentro dele (ex.: `/data/sdr.db`).

Observação: o plano gratuito costuma dormir e apagar dados. Para o piloto, use um plano pago com disco.
