/**
 * Áudio 100% sintetizado — nenhum arquivo, nenhum download, nenhuma gravação
 * real (o que também elimina qualquer questão de direitos sobre som de motor).
 *
 * O motor é montado por síntese aditiva: uma serra na ordem de ignição do V6,
 * harmônicos, o assobio agudo do MGU-K (que é a assinatura sonora da era
 * híbrida) e ruído de ar. Tudo modulado por rotação, carga e velocidade.
 *
 * Dois cuidados de iOS que, sem eles, o jogo fica mudo para muita gente:
 *  - o AudioContext só pode nascer dentro de um gesto do usuário;
 *  - o botão de silencioso do iPhone muta WebAudio, a não ser que um elemento
 *    de mídia esteja tocando para forçar a categoria de sessão.
 */

export class Audio {
  private ctx: AudioContext | null = null;
  private mestre: GainNode | null = null;
  private destravado = false;
  private elementoSilencioso: HTMLAudioElement | null = null;

  // motor
  private oscBase?: OscillatorNode;
  private oscHarm?: OscillatorNode;
  private oscWhine?: OscillatorNode;
  private ganhoBase?: GainNode;
  private ganhoHarm?: GainNode;
  private ganhoWhine?: GainNode;
  private filtroMotor?: BiquadFilterNode;

  // ruídos
  private fonteRuido?: AudioBufferSourceNode;
  private ganhoVento?: GainNode;
  private filtroVento?: BiquadFilterNode;
  private ganhoDerrapagem?: GainNode;
  private filtroDerrapagem?: BiquadFilterNode;

  private _volume = 0.75;
  private ativo = false;

  get pronto() { return this.destravado && this.ativo; }

  set volume(v: number) {
    this._volume = Math.max(0, Math.min(1, v));
    if (this.mestre && this.ctx) this.mestre.gain.setTargetAtTime(this._volume, this.ctx.currentTime, 0.05);
  }
  get volume() { return this._volume; }

  /** Deve ser chamado DENTRO de um gesto do usuário. */
  async destravar() {
    if (this.destravado) return;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: 'interactive' });
      this.ctx = ctx;
      if (ctx.state === 'suspended') await ctx.resume();

      // Força a categoria de mídia para o áudio sobreviver ao botão de
      // silencioso — sem isso o jogo fica mudo em boa parte dos iPhones.
      this.iniciarElementoSilencioso();

      const mestre = ctx.createGain();
      mestre.gain.value = this._volume;
      mestre.connect(ctx.destination);
      this.mestre = mestre;

      this.montarMotor(ctx, mestre);
      this.montarRuidos(ctx, mestre);

      this.destravado = true;
      this.ativo = true;

      document.addEventListener('visibilitychange', this.aoTrocarVisibilidade);
    } catch {
      // Áudio é enriquecimento, nunca requisito: se falhar, o jogo segue mudo.
      this.destravado = false;
    }
  }

  private iniciarElementoSilencioso() {
    try {
      const a = document.createElement('audio');
      a.setAttribute('playsinline', '');
      a.loop = true;
      a.volume = 0.001;
      // 0,3 s de silêncio em WAV, embutido — nenhuma requisição de rede
      a.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZURE';
      a.play().catch(() => {});
      this.elementoSilencioso = a;
    } catch { /* opcional */ }
  }

  private aoTrocarVisibilidade = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    if (document.hidden) {
      ctx.suspend().catch(() => {});
    } else {
      // O contexto pode voltar preso em "interrupted" depois de uma ligação ou
      // do bloqueio de tela; retomar é obrigatório para o som não sumir de vez.
      ctx.resume().catch(() => {});
    }
  };

  private montarMotor(ctx: AudioContext, saida: GainNode) {
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 1800;
    filtro.Q.value = 1.1;
    filtro.connect(saida);
    this.filtroMotor = filtro;

    const base = ctx.createOscillator();
    base.type = 'sawtooth';
    base.frequency.value = 90;
    const gBase = ctx.createGain();
    gBase.gain.value = 0;
    base.connect(gBase).connect(filtro);
    base.start();
    this.oscBase = base; this.ganhoBase = gBase;

    const harm = ctx.createOscillator();
    harm.type = 'square';
    harm.frequency.value = 180;
    const gHarm = ctx.createGain();
    gHarm.gain.value = 0;
    harm.connect(gHarm).connect(filtro);
    harm.start();
    this.oscHarm = harm; this.ganhoHarm = gHarm;

    // assobio do MGU-K: a assinatura da era híbrida
    const whine = ctx.createOscillator();
    whine.type = 'sine';
    whine.frequency.value = 1400;
    const gWhine = ctx.createGain();
    gWhine.gain.value = 0;
    whine.connect(gWhine).connect(saida);
    whine.start();
    this.oscWhine = whine; this.ganhoWhine = gWhine;
  }

  private montarRuidos(ctx: AudioContext, saida: GainNode) {
    const dur = 2;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const dados = buf.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;

    const fonte = ctx.createBufferSource();
    fonte.buffer = buf;
    fonte.loop = true;

    const fVento = ctx.createBiquadFilter();
    fVento.type = 'bandpass';
    fVento.frequency.value = 700;
    fVento.Q.value = 0.7;
    const gVento = ctx.createGain();
    gVento.gain.value = 0;
    fonte.connect(fVento).connect(gVento).connect(saida);

    const fDerrapa = ctx.createBiquadFilter();
    fDerrapa.type = 'bandpass';
    fDerrapa.frequency.value = 2600;
    fDerrapa.Q.value = 5.5;
    const gDerrapa = ctx.createGain();
    gDerrapa.gain.value = 0;
    fonte.connect(fDerrapa).connect(gDerrapa).connect(saida);

    fonte.start();
    this.fonteRuido = fonte;
    this.ganhoVento = gVento; this.filtroVento = fVento;
    this.ganhoDerrapagem = gDerrapa; this.filtroDerrapagem = fDerrapa;
  }

  /**
   * Atualiza o som a partir do estado do carro.
   * @param rpm 0..1 · @param velocidade m/s · @param carga 0..1 (acelerador)
   */
  atualizar(rpm: number, velocidade: number, carga: number, derrapando: number, overtake: boolean) {
    const ctx = this.ctx;
    if (!ctx || !this.ativo || ctx.state !== 'running') return;
    const agora = ctx.currentTime;
    const suave = 0.035;

    // frequência de ignição do V6: sobe com a rotação, com um degrau por marcha
    const f = 58 + rpm * 205;
    this.oscBase?.frequency.setTargetAtTime(f, agora, suave);
    this.oscHarm?.frequency.setTargetAtTime(f * 2.02, agora, suave);
    this.oscWhine?.frequency.setTargetAtTime(900 + rpm * 2600, agora, suave);

    // o filtro abre com a carga: é o que diferencia "acelerando" de "sem gás"
    this.filtroMotor?.frequency.setTargetAtTime(700 + carga * 2600 + rpm * 1500, agora, 0.05);

    const vol = 0.1 + carga * 0.14 + (overtake ? 0.05 : 0);
    this.ganhoBase?.gain.setTargetAtTime(vol, agora, suave);
    this.ganhoHarm?.gain.setTargetAtTime(vol * 0.34, agora, suave);
    this.ganhoWhine?.gain.setTargetAtTime((0.012 + rpm * 0.026) * (overtake ? 2.1 : 1), agora, suave);

    const fVel = Math.min(1, velocidade / 95);
    this.ganhoVento?.gain.setTargetAtTime(fVel * fVel * 0.14, agora, 0.08);
    this.filtroVento?.frequency.setTargetAtTime(420 + fVel * 1500, agora, 0.08);

    this.ganhoDerrapagem?.gain.setTargetAtTime(Math.min(0.14, derrapando * 0.19), agora, 0.04);
    this.filtroDerrapagem?.frequency.setTargetAtTime(2200 + derrapando * 900, agora, 0.05);
  }

  /** Bipe curto — usado nas luzes de largada e nos avisos. */
  bipe(frequencia = 880, duracao = 0.12, volume = 0.18) {
    const ctx = this.ctx;
    if (!ctx || !this.mestre || ctx.state !== 'running') return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = frequencia;
    g.gain.setValueAtTime(0, ctx.currentTime);
    g.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duracao);
    o.connect(g).connect(this.mestre);
    o.start();
    o.stop(ctx.currentTime + duracao + 0.02);
  }

  /** Impacto seco de batida ou zebra. */
  impacto(forca = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.mestre || ctx.state !== 'running') return;
    const dur = 0.16;
    const buf = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) {
      d[i] = (Math.random() * 2 - 1) * Math.exp((-i / d.length) * 7);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 420;
    const g = ctx.createGain();
    g.gain.value = Math.min(0.5, 0.28 * forca);
    src.connect(f).connect(g).connect(this.mestre);
    src.start();
  }

  silenciar(sim: boolean) {
    this.ativo = !sim;
    if (this.mestre && this.ctx) {
      this.mestre.gain.setTargetAtTime(sim ? 0 : this._volume, this.ctx.currentTime, 0.06);
    }
  }

  destruir() {
    document.removeEventListener('visibilitychange', this.aoTrocarVisibilidade);
    try { this.fonteRuido?.stop(); } catch { /* já parado */ }
    try { this.oscBase?.stop(); this.oscHarm?.stop(); this.oscWhine?.stop(); } catch { /* já parado */ }
    this.elementoSilencioso?.pause();
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.destravado = false;
  }
}
