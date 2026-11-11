"""Banda sonora 100% sintetizada por código (numpy). Determinista: todo ruido sale de
generadores con semilla fija. Genera work/musica.wav y work/mezcla.wav (voz + música con
ducking).

Uso: python3 src/music.py
"""
import json, subprocess, numpy as np

SR = 44100
VO = 9.5            # la voz empieza en este segundo del vídeo
TOTAL = 463.0
N = int(TOTAL * SR)
BPM = 96.0
B16 = 60.0 / BPM / 4  # semicorchea

rng_master = np.random.default_rng(1965)


def rng(seed):
    return np.random.default_rng(seed)


# ---------------------------------------------------------------- utilidades DSP
def spectral(x, gain_fn):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    return np.fft.irfft(X * gain_fn(f), len(x))


def lp(x, fc, order=2):
    return spectral(x, lambda f: 1 / np.sqrt(1 + (f / fc) ** (2 * order)))


def hp(x, fc, order=2):
    return spectral(x, lambda f: 1 / np.sqrt(1 + (fc / np.maximum(f, 1e-3)) ** (2 * order)))


def bp(x, lo, hi):
    return hp(lp(x, hi), lo)


def env_adsr(n, a, d, s, r, sustain_len):
    t = np.arange(n) / SR
    e = np.zeros(n)
    e = np.where(t < a, t / max(a, 1e-4), e)
    m = (t >= a) & (t < a + d)
    e = np.where(m, 1 - (1 - s) * (t - a) / max(d, 1e-4), e)
    m = (t >= a + d) & (t < sustain_len)
    e = np.where(m, s, e)
    m = t >= sustain_len
    e = np.where(m, s * np.exp(-(t - sustain_len) / max(r, 1e-4)), e)
    return e


def add(buf, sig, t0, gain=1.0):
    i = int(round(t0 * SR))
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    if i < 0:
        sig = sig[-i:]
        i = 0
        j = min(len(buf), len(sig))
    buf[i:j] += sig[: j - i] * gain


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def reverb_ir(seconds, seed, damp=6000):
    n = int(seconds * SR)
    r = rng(seed)
    t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t * 6.9 / seconds)
    ir = lp(ir, damp, 1)
    ir[0] = 0
    return ir / np.sqrt(np.sum(ir ** 2))


def convolve(x, ir):
    L = len(x) + len(ir)
    nfft = 1 << (L - 1).bit_length()
    return np.fft.irfft(np.fft.rfft(x, nfft) * np.fft.rfft(ir, nfft), nfft)[: len(x)]


# ---------------------------------------------------------------- instrumentos
def saw(freq, n, phase0=0.0):
    ph = (phase0 + np.arange(n) * freq / SR) % 1.0
    return 2 * ph - 1


def pad_voice(freqs, dur, seed):
    n = int((dur + 3.0) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    r = rng(seed)
    for f in freqs:
        for det in (-0.0018, 0.0, 0.0021):
            ph = r.random()
            for h in range(1, 7):
                out += np.sin(2 * np.pi * (f * (1 + det) * h * t + ph * h)) / h ** 1.4
    e = env_adsr(n, 1.8, 0.5, 0.85, 1.6, dur)
    lfo = 1 + 0.08 * np.sin(2 * np.pi * 0.13 * t)
    return lp(out * e * lfo, 1400) / (len(freqs) * 6)


def piano(m, dur=3.0, vel=1.0, seed=0):
    f = midi(m)
    n = int((dur + 0.5) * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for h, a in zip(range(1, 9), (1, .55, .32, .22, .12, .08, .05, .03)):
        fh = f * h * (1 + 0.0004 * h * h)
        out += a * np.sin(2 * np.pi * fh * t) * np.exp(-t * (1.1 + 0.9 * h))
    att = np.minimum(1, t / 0.004)
    hammer = rng(seed).standard_normal(n) * np.exp(-t * 90) * 0.04
    return (out * att + hammer) * vel * 0.35


def pluck(m, vel=1.0):
    f = midi(m)
    n = int(1.2 * SR)
    t = np.arange(n) / SR
    s = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)
    return s * np.exp(-t * 7) * np.minimum(1, t / 0.003) * vel * 0.18


def kick(vel=1.0, sub=1.0):
    n = int(0.6 * SR)
    t = np.arange(n) / SR
    f = 45 + 110 * np.exp(-t * 32)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7.5) * sub
    click = rng(7).standard_normal(n) * np.exp(-t * 400) * 0.25
    return np.tanh((body + click) * 1.6) * vel * 0.75


def snare(vel=1.0, seed=3):
    n = int(0.45 * SR)
    t = np.arange(n) / SR
    tone = np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * 0.6
    nz = bp(rng(seed).standard_normal(n), 1200, 9000) * np.exp(-t * 13)
    return np.tanh((tone + nz * 1.2) * 1.3) * vel * 0.55


def hat(vel=1.0, seed=5, open_=False):
    n = int((0.35 if open_ else 0.09) * SR)
    t = np.arange(n) / SR
    nz = hp(rng(seed).standard_normal(n), 7000, 3)
    return nz * np.exp(-t * (9 if open_ else 55)) * vel * 0.16


def crash(vel=1.0, seed=11):
    n = int(3.0 * SR)
    t = np.arange(n) / SR
    nz = hp(rng(seed).standard_normal(n), 4000, 2)
    return nz * np.exp(-t * 1.4) * np.minimum(1, t / 0.002) * vel * 0.22


def tom(m, vel=1.0):
    n = int(0.7 * SR)
    t = np.arange(n) / SR
    f = midi(m) * (1 + 0.5 * np.exp(-t * 20))
    return np.tanh(np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 6) * 1.5) * vel * 0.55


def power_chord(root_m, dur, mute=False, seed=0):
    """Guitarra distorsionada: quinta + octava, dos pistas desafinadas, saturación tanh."""
    n = int((dur + (0.08 if mute else 0.4)) * SR)
    r = rng(seed)
    sig = np.zeros(n)
    for iv in (0, 7, 12):
        f = midi(root_m + iv)
        for det in (-0.004, 0.004):
            sig += saw(f * (1 + det), n, r.random())
    sig = np.tanh(sig * 3.2)
    t = np.arange(n) / SR
    if mute:
        e = np.exp(-t * 18) * np.minimum(1, t / 0.002)
        sig = lp(sig * e, 1100, 2)
    else:
        e = env_adsr(n, 0.004, 0.15, 0.75, 0.12, dur)
        sig = lp(sig * e, 3800, 2)
    return hp(sig, 90) * 0.16


def bass(root_m, dur, seed=0):
    n = int((dur + 0.15) * SR)
    s = np.tanh(saw(midi(root_m - 12), n, rng(seed).random()) * 1.8)
    t = np.arange(n) / SR
    e = env_adsr(n, 0.004, 0.1, 0.8, 0.06, dur)
    return lp(s * e, 380, 2) * 0.35


def impact(vel=1.0, seed=21):
    n = int(5.0 * SR)
    t = np.arange(n) / SR
    f = 30 + 60 * np.exp(-t * 4)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.1)
    nz = lp(rng(seed).standard_normal(n), 900, 2) * np.exp(-t * 3.5) * 0.7
    return np.tanh((boom + nz) * 1.4) * vel * 0.85


def riser(dur, seed=31):
    n = int(dur * SR)
    t = np.arange(n) / SR
    x = t / dur
    nz = rng(seed).standard_normal(n)
    lo = lp(nz, 600)
    hi = hp(nz, 3000)
    s = (lo * (1 - x) + hi * x) * x ** 2.2
    tone = np.sin(2 * np.pi * np.cumsum(110 * 2 ** (2 * x)) / SR) * x ** 3 * 0.25
    return (s * 0.35 + tone) * 0.8


def drone(dur, root=26, seed=41):
    n = int((dur + 2) * SR)
    t = np.arange(n) / SR
    f = midi(root)
    s = np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2 * f * t + 0.3)
    s += 0.25 * np.sin(2 * np.pi * 3.003 * f * t)
    e = env_adsr(n, 2.0, 0.1, 1.0, 1.5, dur)
    lfo = 0.8 + 0.2 * np.sin(2 * np.pi * 0.07 * t)
    return s * e * lfo * 0.22


# ---------------------------------------------------------------- arreglos
D_MINOR_CHORDS = [  # i - VI - III - VII  (Dm, Bb, F, C)
    [50, 53, 57, 62], [46, 50, 53, 58], [45, 48, 53, 57], [48, 52, 55, 60]]


def place_pad(bus, t0, t1, chord_len=4.0, start_idx=0, gain=1.0, seed=100):
    t = t0
    k = start_idx
    while t < t1 - 0.5:
        d = min(chord_len, t1 - t)
        ch = D_MINOR_CHORDS[k % 4]
        add(bus, pad_voice([midi(m) for m in ch], d, seed + k), t, gain)
        add(bus, pad_voice([midi(ch[0] - 12)], d, seed + 50 + k), t, gain * 0.6)
        t += chord_len
        k += 1


def place_pulse(bus, t0, t1, period=1.0, vel=0.35):
    t = t0
    while t < t1:
        add(bus, kick(vel, 1.0), t)
        t += period


def place_heartbeat(bus, t0, t1, period=1.25, vel=0.4):
    t = t0
    while t < t1:
        add(bus, kick(vel), t)
        add(bus, kick(vel * 0.6), t + 0.22)
        t += period


def place_ostinato(bus, t0, t1, notes=(62, 69, 65, 69, 62, 69, 67, 69), step=0.3125, vel=0.6):
    t = t0
    i = 0
    while t < t1:
        add(bus, pluck(notes[i % len(notes)], vel), t)
        t += step
        i += 1


def place_piano(bus, t0, t1, seq=(74, 72, 69, 65, 69, 70, 69, 65), step=2.0, vel=0.7):
    t = t0
    i = 0
    while t < t1:
        add(bus, piano(seq[i % len(seq)], 3.0, vel, i), t)
        if i % 2 == 0:
            add(bus, piano(seq[i % len(seq)] - 24, 3.0, vel * 0.6, i + 99), t)
        t += step
        i += 1


RIFF = [  # 32 semicorcheas (2 compases); (nota relativa a Re2, apagada?) o None
    (0, 1), (0, 1), None, (0, 1), (0, 1), None, (0, 1), (0, 1),
    (3, 0), None, None, (3, 0), None, None, (5, 0), None,
    (0, 1), (0, 1), None, (0, 1), (0, 1), None, (0, 1), (0, 1),
    (-2, 0), None, None, (-4, 0), None, None, (-5, 0), None,
]


def place_heavy(drums, guit, t0, t1, intensity=1.0, crash_start=True, guitars=True):
    step = B16
    n_steps = int((t1 - t0) / step)
    base = 38  # Re2
    if crash_start:
        add(drums, crash(1.0), t0)
    for s in range(n_steps):
        t = t0 + s * step
        pos = s % 32
        beat16 = s % 16
        # batería en medio tiempo: bombo en 0, 3, 6, 10 ; caja en 8
        if beat16 in (0, 3, 6, 10) or (intensity > 0.9 and beat16 in (11, 14)):
            add(drums, kick(0.95 * intensity + 0.05), t)
        if beat16 == 8:
            add(drums, snare(0.9 * intensity + 0.1, 3 + s % 4), t)
        if beat16 % 2 == 0:
            add(drums, hat(0.6 + 0.4 * (beat16 % 4 == 0), 5 + s % 3), t)
        if s % 64 == 0 and s > 0:
            add(drums, crash(0.7), t)
        if guitars:
            ev = RIFF[pos]
            if ev is not None:
                # duración hasta el siguiente evento
                k = 1
                while k < 4 and RIFF[(pos + k) % 32] is None:
                    k += 1
                d = k * step
                note, mute = ev
                add(guit, power_chord(base + note, d * (0.6 if mute else 0.95), bool(mute), s), t, intensity)
                add(guit, bass(base + note, d * 0.9, s), t, intensity)


def place_doc_drums(drums, t0, t1, vel=0.5):
    step = B16
    n = int((t1 - t0) / step)
    for s in range(n):
        t = t0 + s * step
        b = s % 16
        if b in (0, 10):
            add(drums, kick(vel), t)
        if b == 8:
            add(drums, snare(vel * 0.6, 3 + s % 4), t)
        if b % 4 == 2:
            add(drums, hat(vel * 0.7, 5 + s % 3), t)
    for k in range(0, n, 32):
        add(drums, tom(43, vel * 0.5), t0 + (k + 28) * step)
        add(drums, tom(40, vel * 0.5), t0 + (k + 30) * step)


def g(vt):
    return vt + VO


def build():
    timing = json.load(open('src/timing.json'))
    T = {i: u for i, u in enumerate(timing)}

    pad = np.zeros(N)
    keys = np.zeros(N)
    drums = np.zeros(N)
    guit = np.zeros(N)
    fx = np.zeros(N)

    # --- Intro con logo
    add(fx, riser(4.0, 31), 0.0, 0.9)
    add(pad, drone(9.5, 26), 0.0, 1.0)
    add(fx, impact(1.0), 4.0)
    place_heavy(drums, guit, 4.0, 9.0, 1.0)
    add(fx, impact(1.0, 22), g(0.0))

    # --- Gancho
    add(pad, drone(21.5 - 9.5, 26, 42), 9.5, 0.9)
    place_heartbeat(drums, 9.6, 21.0, 1.25, 0.35)
    add(fx, impact(0.6, 23), g(2.89))
    place_pad(pad, g(5.0), g(12.0), 3.5, 0, 0.6)
    add(fx, impact(0.9, 24), g(12.05))
    place_pad(pad, g(12.05), g(26.9), 3.7, 0, 0.9)
    place_ostinato(keys, g(16.56), g(26.5), vel=0.45)
    place_pad(pad, g(26.96), g(32.3), 2.7, 2, 0.7)

    # --- Orígenes (cálido)
    place_pad(pad, g(32.38), g(58.5), 4.0, 0, 0.8, 200)
    place_piano(keys, g(32.38), g(58.4), (69, 65, 67, 62), 2.6, 0.5)
    place_pulse(drums, g(38.64), g(58.4), 1.3, 0.22)

    # --- Emoción (madre)
    add(fx, impact(0.5, 25), g(58.56))
    place_pad(pad, g(61.34), g(75.0), 4.6, 1, 0.55, 300)
    place_piano(keys, g(61.34), g(74.5), (74, 72, 69, 70, 69, 65), 2.3, 0.55)

    # --- Descubre algo -> subida
    add(fx, riser(81.68 - 75.21, 32), g(75.21), 0.9)
    add(pad, drone(81.68 - 75.21, 26, 43), g(75.21), 0.9)

    # --- Ascenso
    add(fx, impact(0.8, 26), g(81.68))
    place_doc_drums(drums, g(81.68), g(99.3), 0.55)
    place_pad(pad, g(81.68), g(99.4), 2.5, 0, 0.7, 400)
    place_ostinato(keys, g(84.09), g(99.3), vel=0.5)
    add(fx, riser(1.6, 33), g(99.43) - 1.6, 0.8)

    # --- 1992: HEAVY
    add(fx, impact(1.0, 27), g(99.43))
    place_heavy(drums, guit, g(99.43), g(112.9), 0.9)
    for vt in (113.47, 114.58, 116.15):
        add(fx, impact(1.0, int(vt)), g(vt))
        add(drums, crash(0.9), g(vt))
    place_heavy(drums, guit, g(117.99), g(124.6), 0.7, True)
    add(fx, impact(0.9, 28), g(124.75))   # "Spoiler"

    # --- La máquina (análisis)
    place_pad(pad, g(131.1), g(167.3), 3.2, 0, 0.65, 500)
    place_ostinato(keys, g(132.91), g(167.0), (62, 69, 74, 69, 65, 69, 72, 69), 0.3125, 0.5)
    place_pulse(drums, g(132.91), g(167.0), 0.625 * 2, 0.3)

    # --- El método: HEAVY gimnasio
    add(fx, impact(1.0, 29), g(167.43))
    place_heavy(drums, guit, g(167.43), g(209.9), 0.75)
    add(fx, impact(1.0, 30), g(210.35))   # ¿y si...?

    # --- Talento vs disciplina
    place_pad(pad, g(215.13), g(253.8), 3.6, 1, 0.7, 600)
    place_doc_drums(drums, g(227.06), g(253.6), 0.45)
    place_ostinato(keys, g(234.74), g(253.6), vel=0.4)
    add(fx, riser(2.0, 34), g(253.93) - 2.0, 0.8)

    # --- Rivales: HEAVY
    add(fx, impact(1.0, 35), g(253.93))
    place_heavy(drums, guit, g(253.93), g(287.9), 0.95)
    for vt in YEAR_HITS:
        add(fx, impact(0.7, int(vt * 10)), g(vt))

    # --- 2002 (tensión)
    add(fx, impact(0.9, 36), g(288.26))
    add(pad, drone(312.0 - 288.26, 26, 44), g(288.26), 1.0)
    place_heartbeat(drums, g(288.3), g(312.0), 1.1, 0.4)
    place_pad(pad, g(301.3), g(319.4), 4.5, 1, 0.5, 700)
    place_ostinato(keys, g(312.42), g(319.3), (62, 65, 69, 65), 0.3125, 0.4)

    # --- Lesión y retirada (oscuro)
    place_pad(pad, g(319.63), g(338.0), 4.6, 1, 0.55, 800)
    place_piano(keys, g(319.63), g(337.6), (69, 65, 62, 64), 2.4, 0.5)
    add(fx, riser(0.9, 35), g(338.62) - 0.9, 0.6)

    # --- 2016: HEAVY regreso
    add(fx, impact(1.0, 37), g(338.62))
    place_heavy(drums, guit, g(338.62), g(354.2), 1.0)

    # --- Resultado (emotivo, luminoso)
    place_pad(pad, g(354.32), g(375.9), 4.0, 2, 0.75, 900)
    place_piano(keys, g(354.32), g(375.6), (72, 74, 77, 76, 74, 72), 1.9, 0.5)
    place_pulse(drums, g(362.38), g(375.5), 1.25, 0.25)

    # --- La pregunta
    add(fx, impact(0.7, 38), g(376.38))
    place_pad(pad, g(376.38), g(405.6), 3.8, 0, 0.6, 1000)
    place_ostinato(keys, g(378.69), g(405.0), vel=0.4)
    place_pulse(drums, g(382.79), g(405.0), 1.25, 0.28)

    # --- Legado: subida y HEAVY final
    place_pad(pad, g(407.44), g(429.5), 3.3, 0, 0.75, 1100)
    place_doc_drums(drums, g(410.56), g(429.4), 0.5)
    add(fx, riser(429.58 - 422.46, 36), g(422.46), 0.9)
    add(fx, impact(1.0, 39), g(429.58))
    place_heavy(drums, guit, g(429.58), g(439.4), 1.0)
    add(fx, impact(0.8, 40), g(439.51))
    place_heavy(drums, guit, g(439.51), g(456.5), 0.6, False)
    add(fx, impact(1.0, 41), 456.5)
    add(pad, drone(5.0, 26, 45), 456.5, 0.8)

    # Reverbs de bus
    ir_long = reverb_ir(3.2, 77)
    ir_room = reverb_ir(1.0, 78, 5000)
    pad_w = pad + 0.45 * convolve(pad, ir_long)
    keys_w = keys + 0.6 * convolve(keys, ir_long)
    drums_w = drums + 0.18 * convolve(drums, ir_room)
    fx_w = fx + 0.5 * convolve(fx, ir_long)
    guit_w = guit + 0.12 * convolve(guit, ir_room)

    L = 0.85 * pad_w + 0.75 * keys_w + 0.9 * drums_w + 0.85 * guit_w + 0.8 * fx_w
    # estéreo: ensanchado con retardo corto en pad/keys
    d = int(0.011 * SR)
    wide = 0.85 * pad_w + 0.75 * keys_w
    R = L.copy()
    R[d:] = L[d:] - wide[d:] + wide[:-d]
    st = np.stack([L, R], 1)
    st = np.tanh(st * 0.9) / 0.9
    st /= np.max(np.abs(st)) + 1e-9
    return st * 0.89


def voice_years():
    timing = json.load(open('src/timing.json'))
    u = [x for x in timing if x['text'].startswith('en 1992, 1995')][0]
    # posición proporcional por caracteres dentro de la frase
    txt = u['text']
    res = []
    for y in ('1992', '1995', '2000', '2002'):
        k = txt.index(y)
        res.append(u['t0'] + (u['t1'] - u['t0']) * (k + 2) / (len(txt) + 3))
    return res


YEAR_HITS = voice_years()


def load_voice():
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', 'work/voz.mp3', '-f', 'f32le', '-ac', '1',
                          '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    v = np.frombuffer(raw, np.float32).astype(np.float64)
    out = np.zeros(N)
    i = int(VO * SR)
    out[i:i + len(v)] = v[: N - i]
    return out


def duck(music, voice):
    hop = 441
    frames = len(voice) // hop
    rms = np.sqrt(np.mean(voice[: frames * hop].reshape(frames, hop) ** 2, 1))
    act = np.clip((20 * np.log10(rms + 1e-6) + 45) / 20, 0, 1)
    env = np.zeros(frames)
    e = 0.0
    for k in range(frames):
        target = act[k]
        coef = 0.35 if target > e else 0.025
        e += (target - e) * coef
        env[k] = e
    gain = 1 - 0.62 * env  # ~ -8.4 dB bajo la voz
    gs = np.interp(np.arange(len(music)), np.arange(frames) * hop + hop / 2, gain)
    return music * gs[:, None]


if __name__ == '__main__':
    music = build()
    voice = load_voice()
    m = duck(music, voice) * 0.42
    mix = m + np.stack([voice, voice], 1) * 0.95
    peak = np.max(np.abs(mix))
    mix = mix / max(1.0, peak / 0.97)
    for name, data in (('work/musica.wav', music), ('work/mezcla.wav', mix)):
        pcm = (np.clip(data, -1, 1) * 32767).astype('<i2').tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-',
                        name], input=pcm, check=True)
    print('ok', peak, YEAR_HITS)
