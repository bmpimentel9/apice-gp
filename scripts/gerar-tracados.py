#!/usr/bin/env python3
"""Gera os dados finais de circuito para o ÁPICE GP.

Fonte: bacinger/f1-circuits (MIT).
Saída: TypeScript com pontos XYZ em metros, largura, setores e largada.
"""
import json, math, os

SRC = "/home/bruno/.claude/jobs/189f546e/tmp"
OUT = "/home/bruno/apice-gp/.claude/worktrees/apice-gp-build/src/game/data/tracks.ts"

# Configuração por circuito. Elevação = pontos (fração do arco desde a largada, metros).
# Amplitudes baseadas no desnível real de cada autódromo.
CFG = {
    "br-1940": {
        "slug": "paulista", "nome": "Autódromo Paulista", "cidade": "São Paulo",
        "pais": "BR", "homenagem": "Interlagos", "largura": 12.5, "hora": "tarde",
        "startLL": (-23.7014, -46.6975),
        # Interlagos: reta dos boxes em subida, mergulha no S, ponto baixo na reta
        # oposta, sobe de volta no Juncão. Desnível real ~43 m.
        "elev": [(0.00, 26), (0.06, 30), (0.12, 12), (0.25, 4), (0.40, 0),
                  (0.55, 3), (0.68, 8), (0.80, 6), (0.90, 14), (0.96, 22), (1.00, 26)],
        "cor": "#2F6A38",
    },
    "mc-1929": {
        "slug": "principado", "nome": "Circuito do Principado", "cidade": "Monte Carlo",
        "pais": "MC", "homenagem": "Mônaco", "largura": 9.2, "hora": "dia",
        "startLL": (43.7347, 7.4206),
        # Sobe de Ste Devote até o Casino, desce até o túnel, plano na marina.
        "elev": [(0.00, 6), (0.08, 10), (0.18, 38), (0.30, 40), (0.42, 20),
                  (0.52, 8), (0.65, 3), (0.78, 2), (0.90, 3), (1.00, 6)],
        "cor": "#C9A227",
    },
    "it-1922": {
        "slug": "templo", "nome": "Templo da Velocidade", "cidade": "Monza",
        "pais": "IT", "homenagem": "Monza", "largura": 14.0, "hora": "dia",
        "startLL": (45.6203, 9.2816),
        "elev": [(0.00, 4), (0.25, 2), (0.50, 6), (0.75, 3), (1.00, 4)],
        "cor": "#2F6A38",
    },
    "sa-2021": {
        "slug": "corniche", "nome": "Corniche Noturno", "cidade": "Jeddah",
        "pais": "SA", "homenagem": "Jeddah", "largura": 12.0, "hora": "noite",
        "startLL": (21.6319, 39.1044),
        "elev": [(0.00, 2), (0.30, 3), (0.60, 2), (1.00, 2)],
        "cor": "#1D3FE0",
    },
    "jp-1962": {
        "slug": "oito", "nome": "Circuito Oito", "cidade": "Suzuka",
        "pais": "JP", "homenagem": "Suzuka", "largura": 13.0, "hora": "dia",
        "startLL": (34.8431, 136.5407),
        # Sobe nos esses, ponto alto na Degner, desce até a Spoon, sobe no 130R.
        "elev": [(0.00, 12), (0.12, 26), (0.22, 34), (0.35, 22), (0.50, 8),
                  (0.62, 4), (0.75, 10), (0.88, 18), (1.00, 12)],
        "cor": "#E2241B",
    },
    "be-1925": {
        "slug": "ardenas", "nome": "Ardenas", "cidade": "Spa",
        "pais": "BE", "homenagem": "Spa-Francorchamps", "largura": 13.5, "hora": "dia",
        "startLL": (50.4372, 5.9714),
        # O mais dramático: Eau Rouge sobe ~40 m em poucos segundos. Desnível ~100 m.
        "elev": [(0.00, 30), (0.04, 12), (0.09, 52), (0.16, 68), (0.28, 74),
                  (0.40, 58), (0.52, 40), (0.64, 30), (0.76, 44), (0.88, 52),
                  (0.95, 40), (1.00, 30)],
        "cor": "#0E6B4F",
    },
}

STEP = 8.0  # metros entre pontos do traçado


def to_meters(coords):
    lons = [c[0] for c in coords]; lats = [c[1] for c in coords]
    lat0 = sum(lats) / len(lats); lon0 = sum(lons) / len(lons)
    mlat = 111132.92 - 559.82 * math.cos(2 * math.radians(lat0)) + 1.175 * math.cos(4 * math.radians(lat0))
    mlon = 111412.84 * math.cos(math.radians(lat0)) - 93.5 * math.cos(3 * math.radians(lat0))
    return [((lon - lon0) * mlon, (lat - lat0) * mlat) for lon, lat in coords], (lat0, lon0, mlat, mlon)


def dedupe(pts, eps=0.5):
    out = [pts[0]]
    for p in pts[1:]:
        if math.dist(p, out[-1]) > eps:
            out.append(p)
    if math.dist(out[0], out[-1]) < eps * 4:
        out.pop()
    return out


def perimeter(pts):
    n = len(pts)
    return sum(math.dist(pts[i], pts[(i + 1) % n]) for i in range(n))


def catmull(p0, p1, p2, p3, t):
    t2, t3 = t * t, t * t * t
    return (0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
            0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3))


def densify(pts, sub=10):
    n = len(pts); out = []
    for i in range(n):
        p0, p1, p2, p3 = pts[(i - 1) % n], pts[i], pts[(i + 1) % n], pts[(i + 2) % n]
        for k in range(sub):
            out.append(catmull(p0, p1, p2, p3, k / sub))
    return out


def resample(pts, step):
    n = len(pts); total = perimeter(pts)
    count = max(64, int(round(total / step))); step = total / count
    out = [pts[0]]; idx = 0; cur = pts[0]
    seg_left = math.dist(pts[0], pts[1])
    for _ in range(count - 1):
        need = step
        while need > seg_left:
            need -= seg_left; idx = (idx + 1) % n; cur = pts[idx]
            seg_left = math.dist(pts[idx], pts[(idx + 1) % n])
        nxt = pts[(idx + 1) % n]; d = math.dist(cur, nxt)
        f = need / d if d > 0 else 0
        cur = (cur[0] + (nxt[0] - cur[0]) * f, cur[1] + (nxt[1] - cur[1]) * f)
        seg_left -= need; out.append(cur)
    return out


def smooth(pts, passes, w):
    n = len(pts); cur = list(pts)
    for _ in range(passes):
        cur = [(cur[i][0] * (1 - 2 * w) + (cur[(i - 1) % n][0] + cur[(i + 1) % n][0]) * w,
                cur[i][1] * (1 - 2 * w) + (cur[(i - 1) % n][1] + cur[(i + 1) % n][1]) * w) for i in range(n)]
    return cur


def curvature(pts, span=2):
    n = len(pts); out = []
    for i in range(n):
        a, b, c = pts[(i - span) % n], pts[i], pts[(i + span) % n]
        ax, ay = a[0] - b[0], a[1] - b[1]; cx, cy = c[0] - b[0], c[1] - b[1]
        cross = ax * cy - ay * cx
        denom = math.hypot(ax, ay) * math.hypot(cx, cy) * math.dist(a, c)
        out.append(0.0 if denom < 1e-6 else (2.0 * cross) / denom)
    return out


def adaptive_smooth(pts, min_radius):
    """Suaviza repetidamente só onde o raio é irrealmente pequeno (ruído de
    digitalização), preservando os grampos legítimos."""
    n = len(pts)
    for _ in range(60):
        k = curvature(pts)
        bad = [i for i in range(n) if abs(k[i]) > 1 / min_radius]
        if not bad:
            break
        cur = list(pts)
        for i in bad:
            a, b, c = cur[(i - 1) % n], cur[i], cur[(i + 1) % n]
            pts[i] = ((a[0] + c[0]) * 0.5 * 0.6 + b[0] * 0.4, (a[1] + c[1]) * 0.5 * 0.6 + b[1] * 0.4)
    return pts


def signed_area(pts):
    n = len(pts)
    return sum(pts[i][0] * pts[(i + 1) % n][1] - pts[(i + 1) % n][0] * pts[i][1] for i in range(n)) / 2.0


def elevation_at(profile, f):
    """Interpola o perfil de elevação (fração do arco -> metros) com suavização."""
    f = f % 1.0
    for i in range(len(profile) - 1):
        f0, e0 = profile[i]; f1, e1 = profile[i + 1]
        if f0 <= f <= f1:
            t = (f - f0) / (f1 - f0) if f1 > f0 else 0
            t = t * t * (3 - 2 * t)  # smoothstep
            return e0 + (e1 - e0) * t
    return profile[-1][1]


def longest_straight(k, threshold=1 / 400):
    """Devolve (inicio, fim) do trecho mais longo de baixa curvatura."""
    n = len(k); best = (0, 0, 0)
    i = 0
    while i < n * 2:
        if abs(k[i % n]) < threshold:
            j = i
            while j < i + n and abs(k[j % n]) < threshold:
                j += 1
            if j - i > best[2]:
                best = (i % n, (j - 1) % n, j - i)
            i = j
        else:
            i += 1
    return best


def main():
    out_tracks = []
    report = {}
    for cid, cfg in CFG.items():
        gj = json.load(open(os.path.join(SRC, f"{cid}.geojson")))
        feat = gj["features"][0]; props = feat["properties"]
        coords = feat["geometry"]["coordinates"]
        if feat["geometry"]["type"] == "MultiLineString":
            coords = max(coords, key=len)

        raw, proj = to_meters(coords)
        lat0, lon0, mlat, mlon = proj
        pts = dedupe(raw)
        pts = densify(pts, sub=8)
        # Mônaco é curto e sinuoso: suavizar como os outros apaga a curva do
        # túnel e transforma o trecho mais rápido numa reta falsa.
        pts = smooth(pts, 2, 0.14) if cid == "mc-1929" else smooth(pts, 4, 0.24)
        pts = resample(pts, STEP)
        # Mônaco tem grampo legítimo de ~10 m; os outros não descem de 18 m.
        pts = adaptive_smooth(pts, 10.0 if cid == "mc-1929" else 18.0)
        pts = smooth(pts, 2, 0.16)
        pts = resample(pts, STEP)

        official = props.get("length") or perimeter(pts)
        scale = official / perimeter(pts)
        pts = [(x * scale, y * scale) for x, y in pts]

        # localiza a largada: ponto do traçado mais próximo da coordenada informada
        slat, slon = cfg["startLL"]
        sx = (slon - lon0) * mlon * scale
        sy = (slat - lat0) * mlat * scale
        k = curvature(pts)
        start_idx = min(range(len(pts)), key=lambda i: math.dist(pts[i], (sx, sy)))
        start_dist = math.dist(pts[start_idx], (sx, sy))
        method = "coordenada"
        # se a coordenada estiver longe ou numa curva, usa a reta mais longa
        if start_dist > 120 or abs(k[start_idx]) > 1 / 250:
            a, b, ln = longest_straight(k)
            start_idx = int((a + ln * 0.35)) % len(pts)
            method = "reta-mais-longa"

        # rotaciona para a largada ficar no índice 0
        pts = pts[start_idx:] + pts[:start_idx]
        k = curvature(pts)

        # sentido: garante que o traçado siga o sentido real de corrida
        area = signed_area(pts)
        is_ccw = area > 0
        want_ccw = cfg["homenagem"] in ("Interlagos", "Jeddah")
        if is_ccw != want_ccw:
            pts = [pts[0]] + pts[1:][::-1]
            k = curvature(pts)

        # centraliza no plano
        cx = sum(p[0] for p in pts) / len(pts); cy = sum(p[1] for p in pts) / len(pts)
        pts = [(x - cx, y - cy) for x, y in pts]

        # elevação ao longo do arco
        n = len(pts)
        total = perimeter(pts)
        arc = 0.0
        pts3 = []
        for i, (x, y) in enumerate(pts):
            f = arc / total
            z = elevation_at(cfg["elev"], f)
            pts3.append((x, y, z))
            arc += math.dist(pts[i], pts[(i + 1) % n])

        radii = [(1 / abs(v) if abs(v) > 1e-5 else 9999) for v in k]
        a, b, ln = longest_straight(k)

        report[cfg["slug"]] = {
            "nome": cfg["nome"], "comprimento": round(total),
            "pontos": n, "raioMin": round(min(radii), 1),
            "sentido": "anti-horário" if signed_area(pts) > 0 else "horário",
            "largadaVia": method, "retaMaisLonga_m": round(ln * STEP),
            "desnivel_m": round(max(p[2] for p in pts3) - min(p[2] for p in pts3)),
        }

        out_tracks.append({
            "id": cfg["slug"], "nome": cfg["nome"], "cidade": cfg["cidade"],
            "pais": cfg["pais"], "homenagem": cfg["homenagem"],
            "comprimento": round(total, 1), "largura": cfg["largura"],
            "hora": cfg["hora"], "cor": cfg["cor"],
            "pontos": [[round(x, 1), round(y, 1), round(z, 1)] for x, y, z in pts3],
        })

    # emite TypeScript
    body = ",\n".join(
        "  {\n" + "".join(f"    {k}: {json.dumps(v, ensure_ascii=False)},\n" for k, v in t.items() if k != "pontos")
        + "    pontos: " + json.dumps(t["pontos"], ensure_ascii=False) + ",\n  }"
        for t in out_tracks)

    ts = f"""// GERADO AUTOMATICAMENTE — não editar à mão.
// Fonte da geometria: https://github.com/bacinger/f1-circuits (MIT).
// Traçados reamostrados, suavizados e reescalados; elevação autoral.
// Nomes são homenagens — nenhuma marca real é utilizada.

export interface DadosCircuito {{
  id: string;
  nome: string;
  cidade: string;
  pais: string;
  homenagem: string;
  comprimento: number;
  largura: number;
  hora: 'dia' | 'tarde' | 'noite';
  cor: string;
  /** Centro da pista em metros: [x, y, elevação]. Índice 0 = linha de largada. */
  pontos: [number, number, number][];
}}

export const CIRCUITOS: DadosCircuito[] = [
{body},
];

export const circuitoPorId = (id: string) =>
  CIRCUITOS.find((c) => c.id === id) ?? CIRCUITOS[0];
"""
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    open(OUT, "w").write(ts)
    print(json.dumps(report, indent=2, ensure_ascii=False))
    print(f"\n-> {OUT} ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
