# SAMU Gestor · Vassouras (versão real)

Aplicativo web administrativo do SAMU Vassouras. Funciona no celular (pode ser instalado na tela inicial) e no computador.

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `app.js`, `style.css` | O aplicativo |
| `firebase-config.js` | **Onde se cola a configuração do Firebase** (único arquivo a editar na instalação) |
| `firestore.rules` | Regras de segurança do banco (colar no Console do Firebase) |
| `manifest.webmanifest`, `sw.js`, `icone-*.png` | Instalação no celular |
| `testes/` | Testes automáticos (só para manutenção) |

## Perfis

- **Plantonista**: checklist USB/USA, contagem de material, intercorrências, a própria escala, sugestões. Vê só o que é seu.
- **Coordenador**: painel do dia, solicitações e ofícios (únicos com dados de paciente), relatórios em PDF, escala, funcionários, listas.
- **Administração (Denise)**: painel, relatórios, funcionários, listas, cópia de segurança, registro de ações. Não vê solicitações de pacientes (LGPD).

## Instalação (uma vez)

1. Em https://console.firebase.google.com crie um projeto (ex.: `samu-gestor-vassouras`). Pode desligar o Google Analytics.
2. **Authentication** > Começar > Método de login > **E-mail/senha** > Ativar > Salvar.
3. **Firestore Database** > Criar banco > Local `southamerica-east1 (São Paulo)` > modo de produção.
4. Firestore > aba **Regras**: apague tudo, cole o conteúdo de `firestore.rules` e clique em **Publicar**.
5. Configurações do projeto (engrenagem) > Seus apps > ícone **</>** (Web) > nome `SAMU Gestor` > Registrar. Copie os valores de `firebaseConfig` para `firebase-config.js`.
6. Publique a pasta (GitHub Pages ou Firebase Hosting).
7. Authentication > Configurações > **Domínios autorizados** > adicione o endereço do site (ex.: `nattalyy-png.github.io`).
8. Abra o site e use **"Primeiro acesso do sistema"** para criar a conta da administração. Esse formulário some depois do primeiro uso.
9. Em **Funcionários**, cadastre o coordenador e a equipe. Cada um recebe um e-mail para criar a própria senha.
10. Em **Listas e ofícios**, troque as listas de exemplo pelas oficiais e marque "Estas já são as listas oficiais".

## Plano gratuito (Spark)

Login ilimitado; banco com 1 GiB, 50 mil leituras e 20 mil gravações por dia. Para 20 a 30 usuários fica bem abaixo do limite. Não usa Cloud Storage. Não há backup automático: baixe a **Cópia de segurança** uma vez por mês.

## LGPD

- Solicitações guardam apenas as **iniciais** do paciente, o setor e um resumo do quadro. Só o coordenador vê.
- Intercorrências e checklists não devem ter dados de pacientes (o app avisa).
- Toda gravação leva o autor e a hora do servidor; o registro de ações não pode ser apagado.
- Vale confirmar com a TI/jurídico da prefeitura se há exigências para o uso.

## Para quem for dar manutenção

- Sem etapa de build: HTML + JavaScript (módulos) + Firebase JS SDK 10.12.2 via gstatic; jsPDF 2.5.1 e jspdf-autotable 3.8.2 via cdnjs.
- Coleções: `users`, `checklists`, `materiais`, `intercorrencias`, `sugestoes`, `escala`, `solicitacoes`, `log`, `config/{setup,listas,contador}`.
- Consultas usam só igualdades (`user`, `dia`, `mes`), então não é preciso criar índices compostos.
- Gravações funcionam sem internet (cache local do Firestore) e sobem quando o sinal volta.
- Testes: em `testes/`, `npm i firebase-tools@13 @firebase/rules-unit-testing@3 firebase@10 esbuild jspdf@2.5.1 jspdf-autotable@3.8.2`, depois `npx firebase emulators:exec --only firestore --project demo-samu "node rules.test.mjs"` (38 verificações das regras) e `./build-test.sh && npx firebase emulators:exec --only firestore,auth --project demo-samu "node e2e.mjs"` (percorre o app inteiro com os três perfis). Para abrir o app nos emuladores: `http://localhost:5050/?emulador=1`.
