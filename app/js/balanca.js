/* Balança AnimallTAG AT55 pelo Bluetooth clássico (porta serial), via Web Serial do Chrome.
   Protocolo (AnimallTAG, "Protocolo AT55 simplificado"):
     envia 0x30 → recebe [0x05, peso baixo, peso alto, sinal (1 = +), situação (1 estável, 0 pesando, 2 zero)]
     envia 0x35 → tara ("T");  0x40 → ping (0x41).
   O vaqueiro conecta uma vez; com a balança respondendo, o peso estável entra sozinho no campo de peso
   do romaneio (entrada, pesagem e venda). O protocolo de segurança do peso continua valendo ao lançar.
   Depois de lançar, só aceita outro peso quando a balança volta a zero (animal saiu). */
(function () {
  'use strict';
  const SPP = '00001101-0000-1000-8000-00805f9b34fb';   // perfil serial do Bluetooth clássico
  const INTERVALO = 350;       // ~3 leituras por segundo
  const SEM_RESPOSTA = 3000;   // sem resposta por 3 s = ligação ruim
  const MINIMO = 10;           // abaixo disso a balança está vazia (resíduo)
  const B = { porta: null, leitor: null, escritor: null, estado: 'desligada', txt: '', ult: null, ultResp: 0, timer: null, fila: [], buf: [], ouv: [], ocupado: false };

  const suportado = () => !!(navigator.serial && navigator.serial.requestPort);
  const avisar = () => B.ouv.forEach(f => { try { f(B) } catch (e) { console.error(e) } });
  const estado = (s, txt) => { B.estado = s; B.txt = txt || ''; avisar() };

  // separa as respostas de 5 bytes do que chega pelo Bluetooth
  function recebe(bytes) {
    for (const x of bytes) B.buf.push(x);
    while (B.buf.length) {
      if (B.buf[0] !== 0x05) { B.buf.shift(); continue }
      if (B.buf.length < 5) break;
      const [, lo, hi, sinal, sit] = B.buf;
      if (sinal > 1 || sit > 2) { B.buf.shift(); continue }
      B.buf.splice(0, 5);
      const kg = (hi * 256 + lo) * (sinal === 1 ? 1 : -1);
      B.ult = { kg, situacao: sit === 1 ? 'estavel' : sit === 2 ? 'zero' : 'pesando', em: Date.now() };
      B.ultResp = Date.now();
      if (B.estado !== 'ligada') estado('ligada'); else avisar();
    }
    if (B.buf.length > 64) B.buf = [];
  }

  async function ler() {
    const porta = B.porta;
    try {
      B.leitor = porta.readable.getReader();
      for (;;) {
        const { value, done } = await B.leitor.read();
        if (done) break;
        if (value) recebe(value);
      }
    } catch (e) {}
    finally { try { B.leitor && B.leitor.releaseLock() } catch (e) {} B.leitor = null }
    if (B.porta === porta) perdeu();   // terminou sem a pessoa desligar: a ligação caiu
  }

  async function escrever(c) {
    if (!B.escritor || B.ocupado) return;
    B.ocupado = true;
    try { await B.escritor.write(new Uint8Array([c])) } catch (e) { perdeu() } finally { B.ocupado = false }
  }

  // só pede peso com a tela do romaneio aberta (poupa a bateria da balança e do celular)
  const precisa = () => document.visibilityState === 'visible' && [...document.querySelectorAll('.bal')].some(e => e.offsetParent !== null);
  function iniciar() {
    clearInterval(B.timer);
    B.timer = setInterval(() => {
      if (!B.porta) return;
      if (B.estado === 'ligada' && Date.now() - B.ultResp > SEM_RESPOSTA) estado('sem-resposta', 'A balança não está respondendo. Confira se está ligada e perto do celular.');
      if (!precisa() && !B.fila.length) return;
      escrever(B.fila.shift() || 0x30);
    }, INTERVALO);
  }

  async function fechar() {
    clearInterval(B.timer); B.timer = null;
    const p = B.porta; B.porta = null; B.buf = []; B.ult = null; B.fila = [];
    try { B.leitor && await B.leitor.cancel() } catch (e) {}
    try { B.escritor && B.escritor.releaseLock() } catch (e) {}
    B.escritor = null;
    try { p && await p.close() } catch (e) {}
  }
  async function perdeu() {
    if (!B.porta) return;
    await fechar();
    estado('caiu', 'A ligação com a balança caiu. Toque em "Conectar balança" para ligar de novo, ou digite o peso.');
  }

  async function abrir(porta) {
    await porta.open({ baudRate: 9600 });   // pelo Bluetooth a velocidade não faz diferença
    B.porta = porta; B.escritor = porta.writable.getWriter(); B.buf = []; B.ult = null; B.ultResp = Date.now();
    ler(); iniciar();
    estado('ligada');
    escrever(0x30);
  }

  async function conectar() {
    if (!suportado()) throw new Error('Este aparelho não liga com a balança. Use o app no Chrome do Android atualizado.');
    if (B.porta) return;
    estado('conectando', 'Procurando a balança…');
    try {
      const ja = await navigator.serial.getPorts();
      for (const p of ja) { try { await abrir(p); return } catch (e) {} }
      const p = await navigator.serial.requestPort({ allowedBluetoothServiceClassIds: [SPP] });
      await abrir(p);
    } catch (e) {
      await fechar();
      if (e && e.name === 'NotFoundError') return estado('desligada');   // a pessoa fechou a lista
      estado('caiu', 'Não foi possível ligar com a balança. Pareie a AT55 no Bluetooth do celular (senha 1234 ou 0000) e tente de novo.');
    }
  }

  async function desligar() { await fechar(); estado('desligada') }
  function tarar() { if (B.porta) B.fila.push(0x35) }
  if (navigator.serial && navigator.serial.addEventListener) navigator.serial.addEventListener('disconnect', e => { if (e.target === B.porta || e.port === B.porta) perdeu() });

  /* ---------- painel na tela do romaneio ---------- */
  const fmt = kg => kg.toLocaleString('pt-BR');
  const visivel = el => el.offsetParent !== null;
  function painel(el, input) {
    if (!el || !input || el.dataset.ok) return;
    el.dataset.ok = '1';
    if (!suportado()) { el.hidden = true; return }
    el.innerHTML = '<div class="balh"><span class="baldot" aria-hidden="true"></span><span class="balt"></span>'
      + '<span class="balb"><button type="button" class="btn sm" data-b="con">Conectar balança</button>'
      + '<button type="button" class="btn sm ghost" data-b="tara" hidden>Zerar balança</button>'
      + '<button type="button" class="btn sm ghost" data-b="desl" hidden>Desligar</button></span></div>'
      + '<div class="balv" hidden aria-live="polite"><b class="balkg"></b><span class="bals"></span>'
      + '<button type="button" class="btn sm ghost" data-b="usar" hidden>Usar este peso</button></div>';
    const q = s => el.querySelector(s);
    const st = { preenchido: null, aguarda: false };
    const preencher = kg => {
      st.preenchido = kg; st.aguarda = false;
      if (input.value !== String(kg)) { input.value = String(kg); input.dispatchEvent(new Event('input', { bubbles: true })) }
    };
    el.addEventListener('click', async e => {
      const b = e.target.closest('[data-b]'); if (!b) return;
      if (b.dataset.b === 'con') { b.disabled = true; try { await conectar() } catch (er) { estado('caiu', er.message) } b.disabled = false }
      if (b.dataset.b === 'desl') desligar();
      if (b.dataset.b === 'tara') tarar();
      if (b.dataset.b === 'usar' && B.ult && B.ult.kg >= MINIMO) { preencher(B.ult.kg); input.focus() }
    });
    function desenhar() {
      const lig = !!B.porta, u = lig && B.estado === 'ligada' ? B.ult : null;
      el.dataset.estado = B.estado;
      q('.balt').textContent = B.txt || (B.estado === 'ligada' ? 'Balança AT55 ligada' : B.estado === 'sem-resposta' ? 'Sem resposta da balança' : 'Balança desligada: digite o peso ou conecte a AT55');
      q('[data-b=con]').hidden = lig; q('[data-b=tara]').hidden = !lig; q('[data-b=desl]').hidden = !lig;
      q('.balv').hidden = !u;
      if (!u) return;
      const vazio = u.situacao === 'zero' || Math.abs(u.kg) < MINIMO;
      q('.balkg').textContent = fmt(u.kg) + ' kg';
      // peso já lançado: espera o animal sair (balança voltar a zero) para aceitar o próximo
      if (st.preenchido !== null && input.value === '') { st.preenchido = null; st.aguarda = true }
      if (vazio) st.aguarda = false;
      let s = vazio ? 'balança vazia' : u.situacao === 'estavel' ? 'estável' : 'pesando…';
      if (!vazio && u.kg < 0) s = 'peso negativo: zere a balança';
      else if (!vazio && st.aguarda) s = 'peso já lançado: aguardando o animal sair';
      q('.bals').textContent = s;
      el.dataset.sit = vazio ? 'zero' : u.situacao;
      q('[data-b=usar]').hidden = vazio || u.kg < MINIMO || input.value === String(u.kg);
      if (!visivel(el) || vazio || u.kg < MINIMO || u.situacao !== 'estavel' || st.aguarda) return;
      // não passa por cima do que a pessoa digitou
      if (input.value === '' || input.value === String(st.preenchido)) preencher(u.kg);
    }
    B.ouv.push(desenhar);
    desenhar();
  }

  window.Balanca = { suportado, conectar, desligar, tarar, painel, _recebe: recebe, get estado() { return B.estado }, get leitura() { return B.ult } };
})();
