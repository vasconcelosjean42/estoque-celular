const { app, BrowserWindow, ipcMain, dialog, shell, powerMonitor, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");
const planilha = require("./planilha");
const rede = require("./rede");
const { log, logger, caminho: caminhoLog } = require("./log");

// Rede de segurança e, principalmente, rastro: o cliente só sabe dizer "fechou
// sozinho", e sem log a investigação vira adivinhação a 400km de distância.
//
// Medido no Electron 33 (não é o padrão do Node): rejeição não tratada só emite
// aviso e o app SEGUE VIVO — então aqui não se mata nada, senão a gente passa a
// derrubar o app em caso que hoje ele aguenta. Já exceção síncrona não tratada
// trava numa caixa de erro do Chromium que o leigo não sabe fechar; morrer com
// o motivo escrito é melhor do que ficar pendurado.
process.on("unhandledRejection", (e) => log("[app] PROMESSA REJEITADA (app segue):", e));
process.on("uncaughtException", (e) => { log("[app] ERRO NAO TRATADO:", e); app.exit(1); });

// Smoke test (test/smoke.js): banco isolado num diretório temporário.
if (process.env.ESTOQUE_DB_DIR) app.setPath("userData", process.env.ESTOQUE_DB_DIR);

// Dois cliques no ícone abriam duas janelas no mesmo banco: a segunda mostrava
// estoque velho e sobrescrevia o da primeira. Agora a 2ª só foca a que já existe.
if (!app.requestSingleInstanceLock()) {
  log("[app] já havia uma janela aberta; esta segunda instância fecha e foca a primeira");
  app.quit();
  return; // módulo CommonJS: nada mais é registrado nesta instância
}
app.on("second-instance", () => {
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

let db;

// O try abraça a função INTEIRA de propósito. Isto roda de hora em hora num
// setInterval, onde ninguém espera o retorno, e o SELECT abaixo ficava de fora
// do try: uma falha ali virava rejeição não tratada. O Electron não derruba o
// app por isso (medido) — o estrago era pior de outro jeito: o backup parava de
// acontecer em silêncio, sem nada na tela nem no log, e só se descobriria no
// dia de precisar da cópia. Agora falha registra e devolve o erro pra Config.
async function backupDiario() {
  try {
    // Copia o .db para a pasta de backup (aponte para a pasta do Google Drive
    // desktop nas configurações e o Drive sobe sozinho quando tiver internet).
    const row = db.prepare("SELECT valor FROM config WHERE chave = 'pasta_backup'").get();
    if (!row || !row.valor) return { ok: false, erro: "Nenhuma pasta de backup escolhida." };
    const destino = path.join(row.valor, `estoque-${new Date().toISOString().slice(0, 10)}.db`);
    await db.backup(destino);
    return { ok: true, destino };
  } catch (e) {
    log("[app] backup falhou:", e);
    return { ok: false, erro: e.message };
  }
}

// Barra de menu. Até aqui era a padrão do Electron (File/Edit/View/Window/Help,
// com o Help apontando pra documentação do Electron — inútil pra loja). O que
// precisa estar ali é o caminho até o log sem instrução por telefone: "Ajuda >
// Ver logs" abre a pasta com o log.txt já selecionado, é só arrastar pro
// WhatsApp. O resto é o menu padrão, só traduzido.
function montarMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: "Arquivo", submenu: [{ role: "quit", label: "Sair" }] },
    {
      label: "Editar",
      submenu: [
        { role: "undo", label: "Desfazer" }, { role: "redo", label: "Refazer" }, { type: "separator" },
        { role: "cut", label: "Recortar" }, { role: "copy", label: "Copiar" }, { role: "paste", label: "Colar" },
        { role: "selectAll", label: "Selecionar tudo" },
      ],
    },
    {
      label: "Exibir",
      submenu: [
        { role: "reload", label: "Recarregar" }, { role: "toggleDevTools", label: "Ferramentas do desenvolvedor" }, { type: "separator" },
        { role: "resetZoom", label: "Tamanho normal" }, { role: "zoomIn", label: "Aumentar" }, { role: "zoomOut", label: "Diminuir" }, { type: "separator" },
        { role: "togglefullscreen", label: "Tela cheia" },
      ],
    },
    { label: "Janela", submenu: [{ role: "minimize", label: "Minimizar" }, { role: "close", label: "Fechar" }] },
    {
      label: "Ajuda",
      submenu: [
        {
          label: "Ver logs",
          click: () => {
            // Fica no log também: "abriu o Ver logs 14:02" diz que a loja mandou
            // o arquivo logo depois do problema, e não o de uma semana atrás.
            log("[app] Ajuda > Ver logs");
            shell.showItemInFolder(caminhoLog());
          },
        },
        { type: "separator" },
        { label: `Versão ${app.getVersion()}`, enabled: false },
      ],
    },
  ]));
}

function createWindow() {
  montarMenu();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: path.join(__dirname, "../build/icon.png"), // só vale em dev: empacotado o Windows usa o do .exe
    webPreferences: { preload: path.join(__dirname, "preload.js") },
  });
  win.maximize(); // maximizada (com barra de título), não quiosque — leigo precisa minimizar

  // As duas mortes que o cliente relata como "reiniciou sozinho", porque em
  // ambas ele mata no Gerenciador de Tarefas e abre de novo: a tela quebrando
  // por baixo (o processo do Chromium morre e a janela fica branca) e o app
  // pendurado — que é o que acontece numa exceção não tratada no main, medido
  // aqui: ele não fecha, trava numa caixa de erro que o leigo não sabe fechar.
  win.webContents.on("render-process-gone", (_e, d) => log("[app] TELA MORREU:", d.reason, "exitCode:", d.exitCode));
  win.on("unresponsive", () => log("[app] APP PENDURADO (nao responde)"));
  win.on("responsive", () => log("[app] app voltou a responder"));
  win.webContents.on("did-fail-load", (_e, code, desc, url) => log("[app] tela não carregou:", code, desc, url));
  // O que a tela mostrou pro cliente. src/main.jsx joga todo erro de operação
  // no console.error antes do diálogo — sem isto, o lado de cá do log sabe que
  // a rede falhou mas não sabe se alguém viu o aviso, nem em qual tela.
  // Só nível 3 (error): o resto é ruído de desenvolvimento.
  win.webContents.on("console-message", (_e, nivel, msg) => {
    if (nivel === 3) log("[tela]", String(msg).replace(/\s+/g, " ").slice(0, 400));
  });
  // Link externo abre no navegador do cliente, não numa janela Electron pelada.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  if (app.isPackaged || process.env.SMOKE) win.loadFile(path.join(__dirname, "../dist/index.html"));
  else win.loadURL("http://localhost:5173");
}

app.whenReady().then(() => {
  // Passo 27: no PC terminal o banco não fica nesta máquina — db.js nem carrega.
  const cfgRede = rede.ler(app);
  const modo = cfgRede.modo;
  const terminal = modo === "cliente";
  // Marco de abertura: é o que permite ler o log e ver "abriu 08:12, morreu
  // 09:12, abriu 09:15" — a cadência é metade do diagnóstico. O "Windows ligado
  // há" é pra ver a corrida da manhã: balcão abrindo antes do principal terminar
  // de ligar é "sem conexão" garantido, e é aí que alguém clica em Desconectar.
  log("--- abrindo versao", app.getVersion(), "modo:", modo,
    "| PC:", os.hostname(), "| Windows", os.release(), "ligado há", Math.round(os.uptime() / 60), "min",
    "| endereços:", rede.ips().join(", ") || "NENHUM",
    terminal ? `| principal: ${cfgRede.url}` : modo === "servidor" ? `| porta: ${cfgRede.porta}` : "",
    "| dados em:", app.getPath("userData"));

  // Os motivos clássicos de "o principal sumiu" que nenhum log de rede pega:
  // o PC dormiu, hibernou, foi bloqueado, desligou. Nos dois lados — no balcão
  // explica o buraco de meia hora sem pedidos, no principal explica a queda.
  for (const ev of ["suspend", "resume", "lock-screen", "unlock-screen", "shutdown", "on-ac", "on-battery"])
    powerMonitor.on(ev, () => log("[energia]", {
      suspend: "PC vai DORMIR/hibernar (suspend)", resume: "PC ACORDOU (resume)",
      "lock-screen": "tela bloqueada", "unlock-screen": "tela desbloqueada",
      shutdown: "Windows DESLIGANDO", "on-ac": "na tomada", "on-battery": "NA BATERIA (notebook desplugado)",
    }[ev]));

  // IP mudou / wifi caiu / cabo saiu: o endereço some da lista. Uma linha só
  // quando muda — o normal é ficar anos igual.
  let enderecos = rede.ips().join(", ");
  setInterval(() => {
    const agora = rede.ips().join(", ");
    if (agora === enderecos) return;
    log("[rede] endereços deste PC MUDARAM:", enderecos || "NENHUM", "->", agora || "NENHUM (sem rede)");
    enderecos = agora;
  }, 30 * 1000);
  if (modo !== "sozinho") setInterval(rede.resumoPeriodico, 30 * 60 * 1000);

  // ponytail: renderer manda SQL direto — app local, sem conteúdo remoto. Passa a
  // valer também na LAN da loja (token no header); se um dia sair dela, trocar
  // por handlers nomeados.
  const executar = (sql, params = []) => {
    const stmt = db.prepare(sql);
    return stmt.reader ? stmt.all(...(params || [])) : stmt.run(...(params || []));
  };

  // Vários comandos numa transação única (venda = baixa estoque + registro).
  // O erro cru do SQLite não diz qual comando quebrou — numa tx de 10 linhas isso
  // vira caça ao tesouro. Anexa o SQL e os parâmetros do que falhou.
  const transacao = (comandos) =>
    db.transaction(() =>
      comandos.map(([sql, params = []]) => {
        try {
          return db.prepare(sql).run(...params);
        } catch (e) {
          e.message = `${e.message}\n\nSQL: ${sql.trim()}\nparams: ${JSON.stringify(params)}`;
          throw e;
        }
      })
    )();

  if (!terminal) {
    db = require("./db");
    // Publica as MESMAS duas operações na rede local, e só se o usuário escolheu
    // "principal" na Config: instalação de um PC só não abre porta nenhuma.
    if (modo === "servidor")
      rede.servir({ executar, transacao }, cfgRede, app.getVersion(), { ocioso: () => powerMonitor.getSystemIdleTime() });
  }

  ipcMain.handle("db", (_e, sql, params = []) =>
    terminal ? rede.chamar("/db", { sql, params }) : executar(sql, params));
  ipcMain.handle("db-tx", (_e, comandos) =>
    terminal ? rede.chamar("/db-tx", { comandos }) : transacao(comandos));

  // Bloco "Rede" da Config.
  ipcMain.handle("rede-info", () => ({ ...rede.ler(app), ips: rede.ips(), porta_padrao: rede.PORTA_PADRAO }));
  ipcMain.handle("rede-salvar", (_e, novo) => rede.salvar(novo));
  ipcMain.handle("rede-testar", (_e, { url, token }) => rede.testar(url, token));
  ipcMain.handle("rede-firewall", () => rede.liberarFirewall(app));

  // Saída de emergência do balcão. Com o principal desligado (ou tirado da loja)
  // o terminal não carrega NADA: o Login pede a lista de usuários pela rede,
  // ela falha, e a Config — onde se troca o modo — está atrás do login. O
  // sistema fica inacessível sem editar rede.json na mão. Este handler desfaz a
  // conexão e reabre o app já usando o banco desta máquina.
  //
  // url e token continuam gravados: reconectar depois é escolher "PC do balcão"
  // de novo, sem digitar o endereço outra vez.
  ipcMain.handle("rede-desconectar", (_e, origem) => {
    // É o clique que "desconecta o balcão do servidor" de vez. Quem, quando e de
    // qual tela — porque a versão da loja é sempre "ninguém mexeu em nada".
    log("[rede] DESCONECTAR clicado em", origem || "(tela não informada)", "— este PC deixa de usar o principal", cfgRede.url, "e passa a usar o banco local");
    rede.salvar({ modo: "sozinho" });
    // O teste precisa da janela viva pra conferir o resultado; o app de verdade
    // reabre sozinho porque pedir "feche e abra" a quem está travado é pedir demais.
    if (!process.env.SMOKE) {
      log("[app] reabrindo o sistema no modo sozinho");
      app.relaunch();
      app.exit(0); // exit e não quit: 'window-all-closed' não pode cancelar o relaunch
    }
    return { ok: true };
  });

  // Passo 22: lê a planilha no processo principal e devolve matriz de strings.
  ipcMain.handle("abrir-planilha", async () => {
    // O teste não consegue clicar num diálogo do sistema: aponta o arquivo por env.
    let caminho = process.env.ESTOQUE_PLANILHA;
    if (!caminho) {
      const r = await dialog.showOpenDialog({
        properties: ["openFile"],
        filters: [{ name: "Planilha", extensions: ["xlsx", "csv"] }],
      });
      if (r.canceled) return null;
      caminho = r.filePaths[0];
    }
    try {
      return { nome: path.basename(caminho), linhas: planilha.ler(caminho, fs.readFileSync(caminho)) };
    } catch (e) {
      return { erro: e.message };
    }
  });

  ipcMain.handle("salvar-planilha", async (_e, { sugestao, linhas }) => {
    let destino = process.env.ESTOQUE_PLANILHA_SAIDA;
    if (!destino) {
      const r = await dialog.showSaveDialog({
        defaultPath: sugestao,
        filters: [{ name: "Planilha", extensions: ["xlsx"] }],
      });
      if (r.canceled) return null;
      destino = r.filePath;
    }
    fs.writeFileSync(destino, planilha.escrever("Produtos", linhas));
    if (!process.env.SMOKE) shell.openPath(destino);
    return destino;
  });

  ipcMain.handle("escolher-pasta", async () => {
    const r = await dialog.showOpenDialog({ properties: ["openDirectory"] });
    return r.canceled ? null : r.filePaths[0];
  });

  ipcMain.handle("escolher-logo", async () => {
    const r = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "Imagens", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
    });
    if (r.canceled) return null;
    const arquivo = r.filePaths[0];
    const mime = arquivo.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return `data:${mime};base64,${fs.readFileSync(arquivo).toString("base64")}`;
  });

  ipcMain.handle("backup-agora", () => backupDiario());

  // Gera o recibo em PDF (janela oculta -> printToPDF) e abre no visualizador
  // padrão. window.print() do renderer abre diálogo sem preview no Windows;
  // isto espelha o original (gera PDF e abre) e ainda arquiva o arquivo.
  ipcMain.handle("nota-pdf", async (_e, { html, numero }) => {
    const dir = path.join(app.getPath("userData"), "notas");
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `nota-${String(numero).padStart(4, "0")}.pdf`);
    const tmpHtml = path.join(app.getPath("temp"), `nota-${Date.now()}.html`);
    fs.writeFileSync(tmpHtml, html, "utf-8");
    const win = new BrowserWindow({ show: false, width: 400, height: 800 });
    try {
      await win.loadFile(tmpHtml);
      const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true });
      fs.writeFileSync(dest, pdf);
      // O teste não lê PDF: guarda o HTML do recibo ao lado pra conferir o conteúdo.
      if (process.env.SMOKE) fs.writeFileSync(dest.replace(/\.pdf$/, ".html"), html, "utf-8");
      if (!process.env.SMOKE) shell.openPath(dest);
      return { ok: true, dest };
    } catch (e) {
      return { ok: false, erro: e.message };
    } finally {
      win.destroy();
      try { fs.unlinkSync(tmpHtml); } catch {}
    }
  });

  // alert/confirm do Chromium travam mouse/teclado no Windows até a janela
  // perder o foco (bug do Electron) — diálogo do sistema no lugar.
  //
  // ATENÇÃO: showMessageBoxSync BLOQUEIA o processo principal inteiro enquanto
  // o diálogo está na tela — inclusive o servidor de rede. No PC principal, um
  // aviso deixado aberto significa balcão parado: os pedidos dele ficam
  // pendurados e, passados 5 min (limite do fetch), viram "Sem conexão". É por
  // isso que cada diálogo do principal deixa no log quanto tempo ficou aberto.
  ipcMain.on("dialogo", (e, { tipo, msg }) => {
    if (process.env.SMOKE) return (e.returnValue = 0); // teste: sempre "OK"
    const win = BrowserWindow.fromWebContents(e.sender);
    const t0 = Date.now();
    e.returnValue = dialog.showMessageBoxSync(win, {
      type: tipo === "confirm" ? "question" : "info",
      message: msg,
      buttons: tipo === "confirm" ? ["OK", "Cancelar"] : ["OK"],
      cancelId: 1,
    });
    const ms = Date.now() - t0;
    if (modo === "servidor" || ms > 30 * 1000)
      log("[app] diálogo", tipo, "ficou", Math.round(ms / 1000) + "s", "aberto",
        modo === "servidor" ? "(servidor de rede parado enquanto isso):" : ":", String(msg).replace(/\s+/g, " ").slice(0, 80));
  });

  // Abrir junto com o Windows (só faz sentido no app instalado; checkbox na Config).
  ipcMain.handle("auto-start", (_e, ligado) => {
    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: ligado });
  });
  // No terminal isto rodaria antes da janela existir, e o principal pode estar
  // desligado: backup e "abrir com o Windows" são do PC que tem o banco.
  if (app.isPackaged && !terminal) {
    const row = db.prepare("SELECT valor FROM config WHERE chave = 'abrir_com_windows'").get();
    app.setLoginItemSettings({ openAtLogin: !row || row.valor !== "0" }); // ligado por padrão
  }

  ipcMain.handle("app-info", () => ({ versao: app.getVersion(), empacotado: app.isPackaged }));

  // Auto-update via GitHub Releases: banco fica em userData, o update não toca nos dados.
  let autoUpdater;
  try { autoUpdater = require("electron-updater").autoUpdater; } catch (e) { log("[updater] indisponível:", e.message); }

  if (autoUpdater) {
    // Sem isto o updater não registra nada: era ele quem baixava e instalava em
    // silêncio, e não havia como saber se tinha rodado naquele PC.
    autoUpdater.logger = logger;
    const envia = (estado, extra = {}) =>
      BrowserWindow.getAllWindows()[0]?.webContents.send("update-status", { estado, ...extra });
    autoUpdater.on("checking-for-update", () => envia("checando"));
    autoUpdater.on("update-available", (i) => envia("baixando", { versao: i.version }));
    autoUpdater.on("update-not-available", () => envia("atual"));
    autoUpdater.on("download-progress", (p) => envia("baixando", { pct: Math.round(p.percent) }));
    autoUpdater.on("update-downloaded", (i) => envia("pronto", { versao: i.version }));
    autoUpdater.on("error", (e) => envia("erro", { msg: e.message }));

    ipcMain.handle("check-update", async () => {
      if (!app.isPackaged) return { erro: "Atualização só funciona no app instalado." };
      try { await autoUpdater.checkForUpdates(); return {}; }
      catch (e) { return { erro: e.message }; }
    });
    ipcMain.handle("install-update", () => {
      if (!app.isPackaged) return;
      log("[updater] usuário clicou em instalar a atualização: fechando para instalar");
      autoUpdater.quitAndInstall();
    });

    if (app.isPackaged) autoUpdater.checkForUpdatesAndNotify().catch((e) => log("[updater] ERRO na checagem:", e.message));
  }

  if (!terminal) {
    backupDiario();
    setInterval(backupDiario, 3600 * 1000); // loja fica aberta o dia todo
  }
  createWindow();
});

app.on("window-all-closed", () => { log("[app] janela fechada pelo usuário"); app.quit(); });
// Processo filho do Chromium (GPU, utilitário) morrendo é o outro jeito de a
// janela ficar branca ou sumir sem "fechando" no log.
app.on("child-process-gone", (_e, d) => log("[app] processo filho morreu:", d.type, d.reason, "exitCode:", d.exitCode));

// Marcos de fechamento. Sem eles o log é uma pilha de "abrindo" sem contexto, e
// não dá pra distinguir o que mais importa: "abriu" logo depois de "fechando" é
// gente fechando e reabrindo; "abriu" SEM "fechando" antes é morte súbita —
// crash, Gerenciador de Tarefas ou queda de energia. É essa diferença que o
// cliente não sabe relatar por telefone.
app.on("before-quit", () => log("--- fechando (saída pedida)"));
app.on("quit", (_e, codigo) => log("--- fechado, código", codigo));

// Só o Windows dispara: a sessão está terminando (desligar/reiniciar/logoff).
// Vale para a outra investigação — "fechando" seguido disto é exatamente a
// condição em que o instalador silencioso do updater roda com o PC indo abaixo.
app.on("session-end", () => log("--- Windows encerrando a sessao (desligar/logoff)"));
