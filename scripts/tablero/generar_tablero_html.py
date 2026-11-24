# Genera el tablero del Motor Clínico HVCP como una página HTML autocontenida (sin scripts ni recursos externos).
# Uso: python -I generar_tablero_html.py <casos.json> <propuestas.json> <salida.html>
import json, sys, math, html, statistics, datetime as D
from collections import Counter, OrderedDict

casos_p, props_p, salida = sys.argv[1:4]
cj = json.load(open(casos_p, encoding='utf-8'))
casos = cj['rows']
meta = {m['label']: m['value'] for m in cj.get('meta', []) if m.get('type') != 'code'}
corte = meta.get('Corte del registro (hora de El Salvador)', '—')
try:
    props = json.load(open(props_p, encoding='utf-8')).get('rows', [])
except (FileNotFoundError, ValueError):
    props = []

e = lambda s: html.escape('' if s is None else str(s))
def pct(v): return '—' if v is None else f'{v:.1f} %'.replace('.', ',')
def p(k, n): return round(1000 * k / n) / 10 if n else None
def wilson(k, n, z=1.96):
    if not n: return (None, None)
    q = k / n; den = 1 + z * z / n; c = (q + z * z / (2 * n)) / den
    h = z * math.sqrt(q * (1 - q) / n + z * z / (4 * n * n)) / den
    return (round(1000 * (c - h)) / 10, round(1000 * (c + h)) / 10)

# ---------- Indicadores (misma lógica que el tablero en línea) ----------
n = len(casos)
cerrados = sum(c['cerrado'] for c in casos)
mins = [c['min_soap'] for c in casos if c.get('min_soap') is not None]
con_hemo = [c for c in casos if c.get('hemo_discordante') is not None]
disc = sum(1 for c in con_hemo if c['hemo_discordante'])
kpi = dict(total=n, ayer=sum(c['ayer'] for c in casos), d7=sum(c['ult7'] for c in casos),
           pct_cerr=p(cerrados, n), cerrados=cerrados, ab48=sum(c['abierto_48h'] for c in casos),
           mediana=statistics.median(mins) if mins else None,
           insuf=p(sum(c['insuficiente'] for c in casos), n), disc=disc, con_hemo=len(con_hemo), pct_disc=p(disc, len(con_hemo)))
ev = [c for c in casos if c['evaluable']]
obj = [c for c in ev if c['objetiva']]
def acc(nombre, s, campo):
    k = sum(1 for c in s if c[campo]); lo, hi = wilson(k, len(s))
    return dict(grupo=nombre, n=len(s), k=k, pct=p(k, len(s)), lo=lo, hi=hi, obj='objetiva' in nombre)
acierto = [acc('Top-1 · todos', ev, 'top1'), acc('Top-3 · todos', ev, 'top3'),
           acc('Top-1 · confirmación objetiva', obj, 'top1'), acc('Top-3 · confirmación objetiva', obj, 'top3')]
t3o = acierto[3]
def resultado(nombre, s):
    return dict(pob=nombre, n=len(s), a1=sum(1 for c in s if c['rango_motor'] == 1),
                a23=sum(1 for c in s if c['rango_motor'] in (2, 3)),
                dc=sum(1 for c in s if not c['top3'] and c['dx_en_motor']),
                df=sum(1 for c in s if not c['top3'] and not c['dx_en_motor']))
res = [resultado('Todos', ev), resultado('Confirmación objetiva', obj), resultado('Sin confirmación objetiva', [c for c in ev if not c['objetiva']])]
ver = Counter(c['version'] for c in casos).most_common(1)[0][0] if casos else None
CONF = {'lab': 'laboratorio', 'img': 'imagen', 'histo': 'histopatología', 'qx': 'cirugía', 'clin': 'clínica', 'resp': 'respuesta al tratamiento'}
def conf_txt(c):  # «laboratorio + imagen» cuando hay segunda base
    t = CONF.get(c['confirmacion'], c['confirmacion'] or 'sin indicar')
    return t + (' + ' + CONF.get(c['confirmacion2'], c['confirmacion2']) if c.get('confirmacion2') else '')
desac = []
for c in ev:
    if c['top3']: continue
    m = []
    if not c['dx_en_motor']: m.append('El diagnóstico no está en el catálogo del motor, así que no podía proponerlo.')
    elif c['rango_motor'] is None: m.append('El motor tiene este diagnóstico, pero no lo incluyó en su lista para este caso.')
    else: m.append(f"El motor lo tiene y lo puso en el puesto {c['rango_motor']}, fuera de los tres primeros.")
    if c['insuficiente']: m.append('El motor marcó la ficha con datos insuficientes' + (f" (faltó: {c['faltan'].lower()})." if c['faltan'] else '.'))
    elif c['faltan']: m.append(f"Faltó: {c['faltan'].lower()}.")
    if not c['objetiva']: m.append('El diagnóstico definitivo no tiene confirmación objetiva.')
    if c['version'] != ver: m.append(f"Se registró con la versión {c['version']} del motor.")
    desac.append(dict(id=c['id'], dx=c['dx_nombre'], conf=conf_txt(c),
                      puesto='No está en el motor' if not c['dx_en_motor'] else (f"{c['rango_motor']}.º" if c['rango_motor'] else 'No apareció'),
                      primero=c['primero_motor'], motivo=' '.join(m)))
por_dia = OrderedDict()
for c in sorted(casos, key=lambda c: c['dia']):
    r = por_dia.setdefault(c['dia'], [0, 0]); r[0 if c['cerrado'] else 1] += 1
turnos = [(t, sum(1 for c in casos if c['turno'] == t)) for t in ('Mañana', 'Tarde', 'Noche')]
faltan = Counter(f for c in casos for f in (c['faltan'] or '').split('; ') if f).most_common()
def agrupar(s, clave):
    g = OrderedDict()
    for c in s:
        r = g.setdefault(c[clave], dict(nombre=c['dx_nombre'] if clave == 'dx_codigo' else c[clave], en_motor=c['dx_en_motor'], n=0, obj=0, t1=0, t3=0))
        r['n'] += 1; r['obj'] += c['objetiva']; r['t1'] += bool(c['top1']); r['t3'] += bool(c['top3'])
    return sorted(g.values(), key=lambda r: (-r['n'], r['nombre'] or ''))
por_sis, por_dx = agrupar(ev, 'sistema'), agrupar(ev, 'dx_codigo')
disp = OrderedDict()
for c in casos:
    r = disp.setdefault(c['dispositivo'], [0, 0, 0]); r[0] += 1; r[1] += c['cerrado']; r[2] += bool(c['hemo_discordante'])
disp = sorted(disp.items(), key=lambda x: -x[1][0])

# ---------- Gráficos SVG ----------
C1, C2, C3, CR, CM = 'var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--bad)', 'var(--muted-bar)'
def tw(s): return 7.0 * len(str(s))  # ancho aproximado del texto a 12 px

def hbar(rows, fmt, color=C1, W=560):
    lw = min(max([tw(r[0]) for r in rows] + [40]) + 10, W * 0.45)
    bh, gap = 20, 8; H = len(rows) * (bh + gap)
    mx = max([r[1] for r in rows] + [1]); sc = (W - lw - 60) / mx
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img">']
    for i, (lab, v, tip) in enumerate(rows):
        y = i * (bh + gap)
        out.append(f'<g><title>{e(tip)}</title><text x="{lw-8}" y="{y+bh/2}" dy="0.35em" text-anchor="end">{e(lab)}</text>'
                   f'<rect x="{lw}" y="{y}" width="{max(1, v*sc):.1f}" height="{bh}" rx="3" fill="{color}"/>'
                   f'<text class="lab" x="{lw+v*sc+6:.1f}" y="{y+bh/2}" dy="0.35em">{e(fmt(v))}</text></g>')
    return ''.join(out) + '</svg>'

def chart_dia(W=900, H=240):
    rows = list(por_dia.items()); m = dict(t=16, r=8, b=26, l=32)
    mx = max([a + b for a, b in por_dia.values()] + [1]); step = 10 if mx > 30 else 5
    top = math.ceil(mx / step) * step; bw = (W - m['l'] - m['r']) / max(1, len(rows))
    y = lambda v: H - m['b'] - v * (H - m['t'] - m['b']) / top
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Casos por día, cerrados y abiertos">']
    for t in range(0, top + 1, step):
        out.append(f'<line class="grid" x1="{m["l"]}" x2="{W-m["r"]}" y1="{y(t):.1f}" y2="{y(t):.1f}"/><text x="{m["l"]-6}" y="{y(t):.1f}" dy="0.35em" text-anchor="end">{t}</text>')
    every = max(1, math.ceil(len(rows) / ((W - m['l']) / 56)))
    for i, (dia, (ce, ab)) in enumerate(rows):
        x = m['l'] + i * bw + bw * 0.15; w = bw * 0.7; d = f'{dia[8:10]}/{dia[5:7]}'
        out.append(f'<g><title>{d}: {ce+ab} casos · {ce} cerrados · {ab} abiertos</title>'
                   f'<rect x="{x:.1f}" y="{y(ce):.1f}" width="{w:.1f}" height="{y(0)-y(ce):.1f}" fill="{C1}"/>'
                   f'<rect x="{x:.1f}" y="{y(ce+ab):.1f}" width="{w:.1f}" height="{y(ce)-y(ce+ab):.1f}" fill="{C2}"/>'
                   f'<text class="lab" x="{x+w/2:.1f}" y="{y(ce+ab)-4:.1f}" text-anchor="middle">{ce+ab}</text></g>')
        if i % every == 0: out.append(f'<text x="{x+w/2:.1f}" y="{H-8}" text-anchor="middle">{d}</text>')
    return ''.join(out) + '</svg>'

def chart_acierto(W=640):
    rh, top, bot = 36, 6, 26; lw = 230; H = top + len(acierto) * rh + bot
    x = lambda v: lw + v * (W - lw - 16) / 100
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Acierto con intervalo de confianza del 95 %">']
    for t in (0, 25, 50, 75, 100):
        out.append(f'<line class="grid" x1="{x(t):.1f}" x2="{x(t):.1f}" y1="{top}" y2="{H-bot}"/><text x="{x(t):.1f}" y="{H-8}" text-anchor="middle">{t} %</text>')
    for i, a in enumerate(acierto):
        cy = top + i * rh + rh / 2; col = C1 if a['obj'] else C3
        out.append(f'<g><title>{e(a["grupo"])}: {a["k"]} de {a["n"]} · {pct(a["pct"])} · IC 95 % {pct(a["lo"])}–{pct(a["hi"])}</title>'
                   f'<text x="{lw-10}" y="{cy}" dy="0.35em" text-anchor="end">{e(a["grupo"])}</text>')
        if a['n']:
            out.append(f'<line x1="{x(a["lo"]):.1f}" x2="{x(a["hi"]):.1f}" y1="{cy}" y2="{cy}" stroke="{col}" stroke-width="3" stroke-linecap="round"/>'
                       f'<circle cx="{x(a["pct"]):.1f}" cy="{cy}" r="6" fill="{col}" stroke="var(--bg)" stroke-width="2"/>'
                       f'<text class="lab" x="{x(a["pct"]):.1f}" y="{cy-10}" text-anchor="middle">{pct(a["pct"])}</text>')
        out.append('</g>')
    return ''.join(out) + '</svg>'

def chart_resultado(W=760):
    segs = [('a1', 'Acierto en 1.er lugar', C1), ('a23', 'Acierto en 2.º o 3.er lugar', C3), ('dc', 'Desacierto: está en el motor', C2), ('df', 'Desacierto: no está en el motor', CR)]
    rows = [r for r in res if r['n']]; bh, gap, top = 26, 36, 4; H = top + len(rows) * (bh + gap)
    out = [f'<svg viewBox="0 0 {W} {H}" width="100%" role="img" aria-label="Aciertos y desaciertos del motor">']
    for i, r in enumerate(rows):
        y0 = top + i * (bh + gap); out.append(f'<text class="lab" x="0" y="{y0+12}">{e(r["pob"])} (n = {r["n"]})</text>')
        acc_ = 0
        for k, t, col in segs:
            v = r[k]
            if not v: continue
            x0 = acc_ * (W - 2) / r['n']; acc_ += v; x1 = acc_ * (W - 2) / r['n']
            out.append(f'<g><title>{e(t)}: {v} de {r["n"]} ({pct(p(v, r["n"]))})</title><rect x="{x0:.1f}" y="{y0+18}" width="{max(1, x1-x0-1):.1f}" height="{bh}" fill="{col}"/>')
            if x1 - x0 > 22: out.append(f'<text class="inv" x="{(x0+x1)/2:.1f}" y="{y0+18+bh/2}" dy="0.35em" text-anchor="middle">{v}</text>')
            out.append('</g>')
    leyenda = ''.join(f'<span><i style="background:{c}"></i>{e(t)}</span>' for _, t, c in segs)
    return f'<div class="legend">{leyenda}</div>' + ''.join(out) + '</svg>'

# ---------- Tablas ----------
def tabla(cab, filas, num=()):
    th = ''.join(f'<th class="{"n" if i in num else ""}">{e(h)}</th>' for i, h in enumerate(cab))
    if not filas: return f'<div class="tw"><table><thead><tr>{th}</tr></thead><tbody><tr><td colspan="{len(cab)}">Ninguno.</td></tr></tbody></table></div>'
    tb = ''.join('<tr>' + ''.join(f'<td class="{"n" if i in num else ""}">{e(v)}</td>' for i, v in enumerate(f)) + '</tr>' for f in filas)
    return f'<div class="tw"><table><thead><tr>{th}</tr></thead><tbody>{tb}</tbody></table></div>'

tiles = [('Casos ayer', kpi['ayer'], 'día anterior al corte'), ('Casos', kpi['d7'], 'últimos 7 días'),
         ('Casos cerrados', pct(kpi['pct_cerr']), f"{kpi['cerrados']} de {n}"), ('Abiertos más de 48 h', kpi['ab48'], 'al corte'),
         ('Minutos hasta la nota SOAP', str(kpi['mediana']).replace('.', ',') if kpi['mediana'] is not None else '—', 'mediana'),
         ('Acierto top-3 (objetiva)', pct(t3o['pct']), f"IC 95 % {pct(t3o['lo'])}–{pct(t3o['hi'])} · n = {t3o['n']}")]
tiles_html = ''.join(f'<div class="tile"><span class="lbl">{e(a)}</span><span class="val">{e(b)}</span><span class="win">{e(c)}</span></div>' for a, b, c in tiles)
props_html = ''.join(f'<article class="prop"><p><span class="pill">{e(r.get("id"))} · {e(r.get("tipo"))}</span></p><h3>{e(r.get("titulo"))}</h3>'
                     f'<p><span class="k">Evidencia:</span> {e(r.get("evidencia"))}</p><p><span class="k">Cambio propuesto:</span> {e(r.get("cambio"))}</p></article>' for r in props) \
             or '<p class="note">No hay propuestas con evidencia suficiente.</p>'
generado = D.datetime.now(D.timezone(D.timedelta(hours=-6))).strftime('%Y-%m-%d %H:%M')

page = f'''<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Tablero Motor Clínico</title>
<style>
:root{{--bg:#f7f8f7;--fg:#1c2421;--mut:#5c6964;--line:#dce2df;--panel:#fff;--c1:#1f7a68;--c2:#d08a2b;--c3:#5b8fc9;--bad:#b8443a;--muted-bar:#b9c4bf;--grid:#e6ebe8;color-scheme:light}}
@media (prefers-color-scheme:dark){{:root{{--bg:#131817;--fg:#e4eae7;--mut:#9fadaa;--line:#2b3431;--panel:#1a201e;--c1:#4cc2a8;--c2:#e8a650;--c3:#7fb0e6;--bad:#e2776c;--muted-bar:#4a5753;--grid:#252d2a;color-scheme:dark}}}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--fg);font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}}
main{{max-width:1080px;margin:0 auto;padding:24px 16px 56px;display:flex;flex-direction:column;gap:32px}}
h1{{font-size:1.6rem;margin:0;text-wrap:balance}} h2{{font-size:1.1rem;margin:0}} h3{{font-size:1rem;margin:0}}
.lead{{margin:8px 0 0;max-width:70ch}} .sub,.note{{color:var(--mut);font-size:.85rem;margin:4px 0 0;max-width:75ch}}
.tiles{{display:grid;grid-template-columns:repeat(auto-fit,minmax(155px,1fr));gap:12px}}
.tile,.prop{{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:0}}
.lbl,.win{{font-size:.8rem;color:var(--mut)}} .val{{font-size:1.9rem;line-height:1.1;font-variant-numeric:tabular-nums}}
section{{display:flex;flex-direction:column;gap:10px;min-width:0}}
.g2{{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:32px}}
svg{{display:block;overflow:visible;max-width:100%}} svg text{{fill:var(--mut);font-size:12px}} svg .lab{{fill:var(--fg)}} svg .inv{{fill:var(--bg);font-weight:600}}
svg .grid{{stroke:var(--grid)}}
.legend{{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:.8rem;color:var(--mut)}} .legend i{{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}}
.tw{{overflow-x:auto;max-width:100%}}
table{{border-collapse:collapse;width:100%;font-size:.85rem;font-variant-numeric:tabular-nums}}
th,td{{padding:6px 8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}} th{{color:var(--mut);font-weight:600}}
td.n,th.n{{text-align:right;white-space:nowrap}}
.props{{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:12px}} .prop p{{margin:0;font-size:.85rem}} .k{{color:var(--mut)}}
.pill{{display:inline-block;padding:1px 8px;border-radius:10px;font-size:.8rem;border:1px solid var(--c2);color:var(--c2)}}
.des td:last-child{{min-width:280px}}
details{{font-size:.85rem;color:var(--mut)}}
</style></head><body><main>
<header>
<h1>Motor Clínico de Urgencias · Tablero</h1>
<p class="lead">Ayer se registraron <b>{kpi['ayer']}</b> casos. Con confirmación objetiva, el diagnóstico definitivo quedó entre los tres primeros del motor en <b>{pct(t3o['pct'])}</b> de los casos (n = {t3o['n']}; IC 95 % {pct(t3o['lo'])}–{pct(t3o['hi'])}).</p>
<p class="sub">Hospital Veterinario Chivo Pets · registro hasta el {e(corte)} (hora de El Salvador) · página generada el {generado} · se actualiza cada día. Sin datos del propietario ni notas clínicas.</p>
</header>
<div class="tiles">{tiles_html}</div>
<section><h2>Casos por día</h2><div class="legend"><span><i style="background:var(--c1)"></i>Cerrados</span><span><i style="background:var(--c2)"></i>Abiertos</span></div>{chart_dia()}</section>
<div class="g2">
<section><h2>Casos por turno</h2><p class="note">Mañana 7–14 h · tarde 15–22 h · noche 23–6 h.</p>{hbar([(t, v, f"{t}: {v} casos ({pct(p(v, n))})") for t, v in turnos], str)}</section>
<section><h2>Campos que faltaron</h2><p class="note">Porcentaje de casos en que el motor señaló el campo como faltante. Datos insuficientes en el {pct(kpi['insuf'])} de los casos.</p>{hbar([(f, p(k, n), f"{f}: faltó en {k} casos") for f, k in faltan], pct, C2)}</section>
</div>
<section><h2>Acierto del motor contra el diagnóstico definitivo</h2><p class="note">Punto: % de cierres con el diagnóstico definitivo en la posición 1 (top-1) o entre las 3 primeras (top-3). Línea: intervalo de confianza del 95 % (Wilson). «Objetiva»: laboratorio, imagen, histopatología o cirugía.</p>
{chart_acierto()}
{tabla(['Grupo', 'n', 'Aciertos', '%', 'IC inferior', 'IC superior'], [(a['grupo'], a['n'], a['k'], pct(a['pct']), pct(a['lo']), pct(a['hi'])) for a in acierto], num=(1, 2, 3, 4, 5))}</section>
<section><h2>Aciertos y desaciertos</h2><p class="note">Puesto del diagnóstico definitivo en la lista del motor, en cada cierre evaluable.</p>{chart_resultado()}</section>
<section><h2>Casos en que el motor no acertó, y por qué</h2><p class="note">Cierres evaluables cuyo diagnóstico no quedó entre los tres primeros. El motivo se deduce de los datos del caso: si el diagnóstico está en el catálogo, en qué puesto quedó, si la ficha tenía datos insuficientes, qué campos faltaron, el tipo de confirmación y la versión del motor.</p>
<div class="des">{tabla(['Caso', 'Diagnóstico definitivo', 'Conf.', 'Puesto en el motor', 'Primer diagnóstico del motor', 'Por qué no acertó'], [(d['id'], d['dx'], d['conf'], d['puesto'], d['primero'], d['motivo']) for d in desac])}</div></section>
<div class="g2">
<section><h2>Acierto por sistema</h2>{tabla(['Sistema', 'n', 'Top-1', 'Top-3', 'Objetivos'], [(r['nombre'], r['n'], r['t1'], r['t3'], r['obj']) for r in por_sis], num=(1, 2, 3, 4))}</section>
<section><h2>Acierto por diagnóstico</h2><p class="note">Un ajuste de pesos o reglas requiere 30 casos con confirmación objetiva.</p>{tabla(['Diagnóstico', 'n', 'Obj.', 'Top-1', 'Top-3'], [(r['nombre'] + ('' if r['en_motor'] else ' (fuera del motor)'), r['n'], r['obj'], r['t1'], r['t3']) for r in por_dx], num=(1, 2, 3, 4))}</section>
</div>
<section><h2>Diagnósticos definitivos que el motor no tiene</h2><p class="note">Se propone agregar uno cuando aparece 3 veces o más.</p>{tabla(['Caso', 'Código', 'Diagnóstico', 'Confirmación'], [(c['id'], c['dx_codigo'], c['dx_nombre'], conf_txt(c)) for c in ev if not c['dx_en_motor']])}</section>
<section><h2>Propuestas pendientes de aprobación</h2><p class="note">Redactadas por el análisis diario. Ninguna está aplicada al motor.</p><div class="props">{props_html}</div></section>
<div class="g2">
<section><h2>Por dispositivo</h2><p class="note">Los casos no identifican al médico, así que se agrupan por dispositivo.</p>{tabla(['Dispositivo', 'Casos', 'Cerrados', '% cerrado', 'Triaje discordante'], [(k, v[0], v[1], pct(p(v[1], v[0])), v[2]) for k, v in disp], num=(1, 2, 3, 4))}</section>
<section><h2>Triaje que no concuerda con las constantes</h2><p class="note">Estado hemodinámico marcado distinto del analizado por el motor: {kpi['disc']} de {kpi['con_hemo']} casos ({pct(kpi['pct_disc'])}).</p>{tabla(['Caso', 'Disp.', 'Marcado', 'Analizado'], [(c['id'], c['dispositivo'], c['hemo_marcado'], c['hemo_analizado']) for c in casos if c.get('hemo_discordante')])}</section>
</div>
<section><h2>Casos abiertos con más de 48 horas</h2>{tabla(['Caso', 'Registro', 'Horas', 'Dispositivo', 'Especie'], [(c['id'], c['fecha'], c['horas'], c['dispositivo'], c['especie']) for c in sorted(casos, key=lambda c: -c['horas']) if c['abierto_48h']], num=(2,))}</section>
<details><summary>Cómo se calculan los indicadores</summary><p>Se excluyen casos de prueba y anulados. Horas de El Salvador (UTC−6); «ayer» y «más de 48 h» se cuentan respecto al corte del registro. Un caso es evaluable cuando su cierre tiene un diagnóstico codificado; el acierto compara ese código con la lista del motor (los códigos compuestos «A / B» cuentan si coincide cualquiera). Intervalos de confianza del 95 % de Wilson. Fuente: Registro del motor › datos › registro.json. El detalle por caso está en el Excel Registro_Motor_Clinico_HVCP.xlsx de esta carpeta.</p></details>
</main></body></html>'''
open(salida, 'w', encoding='utf-8').write(page)
print('Tablero HTML:', salida, '·', n, 'casos ·', len(desac), 'desaciertos')
