let audioCtx: AudioContext | null = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const Context = window.AudioContext || (window as any).webkitAudioContext;
  if (!Context) return null;
  if (!audioCtx) {
    audioCtx = new Context();
  }
  return audioCtx;
}

function playToneSequence(tones: Array<{ freq: number; duration: number; delay: number; gain: number }>) {
  const ctx = getAudioContext();
  if (!ctx) return;

  if (ctx.state === "suspended") {
    void ctx.resume().catch(() => undefined);
  }

  const start = ctx.currentTime;
  tones.forEach((tone) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = tone.freq;
    gain.gain.setValueAtTime(0.0001, start + tone.delay);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, tone.gain), start + tone.delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.delay + tone.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(start + tone.delay);
    osc.stop(start + tone.delay + tone.duration + 0.02);
  });
}

export function playChatMessageSound() {
  playToneSequence([
    { freq: 740, duration: 0.12, delay: 0, gain: 0.04 },
    { freq: 980, duration: 0.18, delay: 0.1, gain: 0.035 },
  ]);
}

export function playNotificationSound() {
  playToneSequence([
    { freq: 620, duration: 0.1, delay: 0, gain: 0.04 },
    { freq: 880, duration: 0.12, delay: 0.08, gain: 0.04 },
    { freq: 1240, duration: 0.18, delay: 0.16, gain: 0.03 },
  ]);
}

export function playMatchFoundSound() {
  playToneSequence([
    { freq: 523.25, duration: 0.24, delay: 0, gain: 0.05 },
    { freq: 659.25, duration: 0.24, delay: 0.16, gain: 0.05 },
    { freq: 783.99, duration: 0.3, delay: 0.32, gain: 0.055 },
    { freq: 1046.5, duration: 0.5, delay: 0.5, gain: 0.05 },
  ]);
}

export function playReadyCheckAcceptSound() {
  playToneSequence([
    { freq: 698.46, duration: 0.1, delay: 0, gain: 0.04 },
    { freq: 880, duration: 0.12, delay: 0.08, gain: 0.035 },
  ]);
}

export function playReadyCheckCompleteSound() {
  playToneSequence([
    { freq: 659.25, duration: 0.16, delay: 0, gain: 0.05 },
    { freq: 783.99, duration: 0.18, delay: 0.12, gain: 0.05 },
    { freq: 987.77, duration: 0.22, delay: 0.24, gain: 0.05 },
    { freq: 1318.51, duration: 0.34, delay: 0.4, gain: 0.055 },
  ]);
}
