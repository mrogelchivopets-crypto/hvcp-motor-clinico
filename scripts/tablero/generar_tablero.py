# Genera los datos del tablero del Motor Clínico HVCP: una fila por caso, sin texto libre ni datos del propietario.
# Uso: python -I generar_tablero.py <registro.json> <index.html> <salida.json>
import json, re, sys, statistics, datetime as D

registro, index_html, salida = sys.argv[1:4]
d = json.load(open(registro, encoding='utf-8'))
html = open(index_html, encoding='utf-8').read()

# Catálogo de diagnósticos del motor: constante DX más DX.push / ADD.
catalogo = {}
for m in re.finditer(r'\{id:"([^"]+)",([^\n]{0,500})', html):
    resto = m.group(2)
    c = re.search(r'\bc:"([A-Z]{3}-[^"]+)"', resto)
    s = re.search(r'\bsys:"([a-z]+)"', resto)
    if c and s:
        for cod in c.group(1).split(' / '):
            catalogo[cod.strip()] = s.group(1)

SISTEMAS = {'dig': 'Digestivo', 'uro': 'Urogenital', 'res': 'Respiratorio', 'cv': 'Cardiovascular / hemoparásitos',
            'tra': 'Traumatismo', 'neu': 'Neurológico', 'hep': 'Hepatobiliar', 'tox': 'Toxicología',
            'end': 'Endocrino', 'der': 'Dermatología', 'oft': 'Oftalmología', 'rep': 'Reproductivo'}
HEMO = {'est': 'Estable', 'comp': 'Compensado', 'desc': 'Descompensado', None: 'Sin marcar'}
TZ = D.timezone(D.timedelta(hours=-6))  # El Salvador
corte = D.datetime.fromisoformat(d['generado'].replace('Z', '+00:00')).astimezone(TZ)
ayer = (corte - D.timedelta(days=1)).date()

def turno(h):
    return 'Mañana' if 7 <= h <= 14 else ('Tarde' if 15 <= h <= 22 else 'Noche')

filas = []
for c in d['casos']:
    if c.get('prueba') or c.get('anulado'):
        continue
    f = D.datetime.fromisoformat(c['f']).astimezone(TZ)
    e, s = c['ent'], c['sal']
    k = d['cierres'].get(c['id'])
    horas = (corte - f).total_seconds() / 3600
    codigo = (k or {}).get('dx') and k['dx'].get('c') or None
    rango = None
    if codigo:
        tops = [set(x.strip() for x in t['c'].split(' / ')) for t in s.get('top', [])]
        rango = next((i + 1 for i, t in enumerate(tops) if codigo in t), None)
    conf = (k or {}).get('conf') or None
    conf2 = (k or {}).get('conf2') or None  # segunda base (opcional, desde v7.9.7)
    hemo_ef = e.get('hemoEf')
    filas.append({
        'id': c['id'],
        'fecha': f.strftime('%Y-%m-%d %H:%M'),
        'dia': f.strftime('%Y-%m-%d'),
        'turno': turno(f.hour),
        'dispositivo': c['vet'].split('disp.')[-1].strip() if 'disp.' in c['vet'] else c['vet'],
        'especie': {'c': 'Canino', 'f': 'Felino'}.get(e.get('esp'), e.get('esp')),
        'version': c.get('v'),
        'min_soap': c.get('min'),
        'ayer': f.date() == ayer,
        'ult7': horas <= 7 * 24,
        'ult30': horas <= 30 * 24,
        'cerrado': k is not None,
        'abierto_48h': k is None and horas > 48,
        'horas': round(horas),
        'confirmacion': conf,
        'confirmacion2': conf2,
        # Objetiva si cualquiera de las dos bases lo es.
        'objetiva': conf in ('histo', 'lab', 'img', 'qx') or conf2 in ('histo', 'lab', 'img', 'qx'),
        'dx_codigo': codigo,
        'dx_nombre': (k or {}).get('dx') and k['dx'].get('n') or None,
        'evaluable': bool(codigo),
        'dx_en_motor': (codigo in catalogo) if codigo else None,
        'sistema': SISTEMAS.get(catalogo.get(codigo), catalogo.get(codigo)) if codigo in catalogo else ('Fuera del motor' if codigo else None),
        'rango_motor': rango,
        'top1': (rango == 1) if codigo else None,
        'top3': (rango is not None and rango <= 3) if codigo else None,
        'primero_motor': s['top'][0]['n'] if s.get('top') else None,
        'insuficiente': bool(s.get('insuf')),
        'faltan': '; '.join(s.get('faltan', [])),
        'hemo_marcado': HEMO.get(e.get('hemo'), e.get('hemo')),
        'hemo_analizado': HEMO.get(hemo_ef, hemo_ef) if hemo_ef else None,
        'hemo_discordante': (hemo_ef != e.get('hemo')) if hemo_ef else None,
    })

filas.sort(key=lambda r: r['fecha'], reverse=True)
codigo_fuente = open(__file__, encoding='utf-8').read()
json.dump({'rows': filas, 'meta': [
    {'label': 'generar_tablero.py', 'value': codigo_fuente, 'type': 'code', 'lang': 'python'},
    {'label': 'Entrada', 'value': 'Registro del motor › datos › registro.json'},
    {'label': 'Corte del registro (hora de El Salvador)', 'value': corte.strftime('%Y-%m-%d %H:%M')},
    {'label': 'Diagnósticos en el catálogo del motor', 'value': str(len(catalogo))},
    {'label': 'Versión del motor', 'value': str(d.get('version_motor'))},
]}, open(salida, 'w', encoding='utf-8'), ensure_ascii=False)
print(len(filas), 'casos ·', corte.strftime('%Y-%m-%d %H:%M'))
