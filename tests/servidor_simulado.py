#!/usr/bin/env python3
"""Imitação local do Supabase (login, duas etapas e REST) sobre o Postgres de teste,
servindo também a pasta app/. Só para testes: não use em produção.
Uso: python3 tests/servidor_simulado.py <porta> <banco>
Código de verificação em duas etapas aceito: 123456."""
import base64, json, os, re, subprocess, sys, time, uuid
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs, unquote

PORTA, BANCO = int(sys.argv[1]), sys.argv[2]
APP = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'app')
FATORES = {}   # user_id -> {id, status}
REFRESH = {}   # refresh -> (user_id, aal)
OFFLINE = {'on': False}

def psql(sql, claims=None):
    pre = ''
    if claims is not None:
        c = json.dumps(claims).replace("'", "''")
        pre = f"set local role authenticated; do $x$ begin perform set_config('request.jwt.claims', '{c}', true); end $x$;\n"
    r = subprocess.run(['psql', '-d', BANCO, '-tAq', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose'],
                       input='begin;\n' + pre + sql + ';\ncommit;', capture_output=True, text=True)
    if r.returncode:
        m = re.search(r'ERROR:\s+(\w{5}):\s+(.*)', r.stderr)
        raise ErroBanco(m.group(1) if m else 'XX000', m.group(2).strip() if m else r.stderr.strip())
    return r.stdout.strip()

class ErroBanco(Exception):
    def __init__(s, code, msg): super().__init__(msg); s.code, s.msg = code, msg

def b64(d): return base64.urlsafe_b64encode(json.dumps(d).encode()).decode().rstrip('=')
def token(uid, email, aal):
    claims = {'sub': uid, 'email': email, 'role': 'authenticated', 'aal': aal, 'exp': int(time.time()) + 3600}
    return b64({'alg': 'none'}) + '.' + b64(claims) + '.x', claims
def lertoken(h):
    t = (h or '').replace('Bearer ', '')
    try: return json.loads(base64.urlsafe_b64decode(t.split('.')[1] + '==='))
    except Exception: return None
def sessao(uid, email, aal):
    t, c = token(uid, email, aal); r = uuid.uuid4().hex; REFRESH[r] = (uid, email, aal)
    return {'access_token': t, 'refresh_token': r, 'expires_in': 3600, 'token_type': 'bearer', 'user': {'id': uid, 'email': email}}

def ident(nome):
    if not re.fullmatch(r'[a-z_][a-z0-9_]*', nome): raise ErroBanco('42601', 'nome inválido')
    return nome
def lit(v): return "'" + str(v).replace("'", "''") + "'"

def filtros(q):
    w = []
    for k, vs in q.items():
        if k in ('select', 'order', 'limit', 'offset', 'on_conflict'): continue
        for v in vs:
            op, _, val = v.partition('.')
            sql_op = {'eq': '=', 'gte': '>=', 'gt': '>', 'lte': '<=', 'lt': '<', 'neq': '<>'}[op]
            w.append(f'{ident(k)} {sql_op} {lit(unquote(val))}')
    return (' where ' + ' and '.join(w)) if w else ''

class H(SimpleHTTPRequestHandler):
    def __init__(s, *a, **k): super().__init__(*a, directory=APP, **k)
    def log_message(s, *a): pass
    def end_headers(s):
        s.send_header('Access-Control-Allow-Origin', '*'); s.send_header('Access-Control-Allow-Headers', '*')
        s.send_header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS'); s.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def resp(s, cod, corpo=None):
        b = b'' if corpo is None else json.dumps(corpo).encode()
        s.send_response(cod); s.send_header('Content-Type', 'application/json'); s.send_header('Content-Length', str(len(b))); s.end_headers(); s.wfile.write(b)
    def do_OPTIONS(s): s.resp(204)
    def corpo(s):
        n = int(s.headers.get('Content-Length') or 0)
        return json.loads(s.rfile.read(n) or b'null') if n else None
    def api(s, metodo):
        u = urlparse(s.path); q = parse_qs(u.query, keep_blank_values=True)
        if u.path == '/__teste/offline': OFFLINE['on'] = q.get('on', ['1'])[0] == '1'; return s.resp(200, {'ok': True})
        if OFFLINE['on'] and (u.path.startswith('/auth/') or u.path.startswith('/rest/')): s.close_connection = True; s.connection.close(); return
        try:
            if u.path.startswith('/auth/v1/'): return s.auth(metodo, u.path[9:], q)
            if u.path.startswith('/rest/v1/'): return s.rest(metodo, u.path[9:], q)
        except ErroBanco as e:
            st = 403 if e.code == '42501' else 409 if e.code in ('23505', '23503') else 400
            return s.resp(st, {'code': e.code, 'message': e.msg})
        return False
    def auth(s, metodo, p, q):
        c = s.corpo() or {}
        if p == 'token' and q.get('grant_type') == ['password']:
            r = psql(f"select id from auth.users where email = {lit(c.get('email',''))} and encrypted_password = crypt({lit(c.get('password',''))}, encrypted_password)")
            if not r: return s.resp(400, {'error': 'invalid_grant', 'error_description': 'Invalid login credentials'})
            return s.resp(200, sessao(r, c['email'], 'aal1'))
        if p == 'token' and q.get('grant_type') == ['refresh_token']:
            x = REFRESH.pop(c.get('refresh_token'), None)
            if not x: return s.resp(400, {'error': 'invalid_grant'})
            return s.resp(200, sessao(*x))
        cl = lertoken(s.headers.get('Authorization'))
        if not cl or 'sub' not in cl: return s.resp(401, {'message': 'JWT inválido'})
        uid = cl['sub']
        if p == 'user' and metodo == 'GET':
            f = FATORES.get(uid)
            return s.resp(200, {'id': uid, 'email': cl['email'], 'factors': [dict(f, factor_type='totp')] if f else []})
        if p == 'user' and metodo == 'PUT':
            psql(f"update auth.users set encrypted_password = crypt({lit(c['password'])}, gen_salt('bf')) where id = {lit(uid)}")
            return s.resp(200, {'id': uid})
        if p == 'factors' and metodo == 'POST':
            FATORES[uid] = {'id': uuid.uuid4().hex, 'status': 'unverified'}
            svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#000"/></svg>'
            return s.resp(200, {'id': FATORES[uid]['id'], 'type': 'totp', 'totp': {'qr_code': 'data:image/svg+xml;utf-8,' + svg, 'secret': 'TESTE234', 'uri': 'otpauth://x'}})
        m = re.fullmatch(r'factors/(\w+)/(challenge|verify)', p)
        if m:
            if m.group(2) == 'challenge': return s.resp(200, {'id': uuid.uuid4().hex})
            if c.get('code') != '123456': return s.resp(422, {'code': 'mfa_verification_failed', 'message': 'Invalid TOTP code entered'})
            FATORES[uid]['status'] = 'verified'
            return s.resp(200, sessao(uid, cl['email'], 'aal2'))
        if p == 'logout': return s.resp(204)
        return s.resp(404, {'message': 'não implementado: ' + p})
    def rest(s, metodo, tab, q):
        cl = lertoken(s.headers.get('Authorization'))
        if not cl or 'sub' not in cl: raise ErroBanco('42501', 'permission denied')
        if tab.startswith('rpc/') and metodo == 'POST':
            args = s.corpo() or {}
            lista = ', '.join(f"{ident(k)} => {lit(json.dumps(v) if isinstance(v, (dict, list)) else v)}" for k, v in args.items())
            r = psql(f"select to_json(public.{ident(tab[4:])}({lista}))", cl)
            return s.resp(200, json.loads(r) if r else None)
        t = ident(tab)
        if metodo == 'GET':
            sel = q.get('select', ['*'])[0]
            cols = '*' if sel == '*' else ', '.join(ident(x) for x in sel.split(','))
            order = ''
            if 'order' in q:
                order = ' order by ' + ', '.join(ident(o.split('.')[0]) + (' desc' if o.endswith('.desc') else '') for o in q['order'][0].split(','))
            lim = f" limit {int(q['limit'][0])}" if 'limit' in q else ''
            off = f" offset {int(q['offset'][0])}" if 'offset' in q else ''
            r = psql(f"select coalesce(json_agg(x), '[]') from (select {cols} from public.{t}{filtros(q)}{order}{lim}{off}) x", cl)
            return s.resp(200, json.loads(r))
        if metodo == 'POST':
            linhas = s.corpo(); linhas = linhas if isinstance(linhas, list) else [linhas]
            cols = sorted({k for l in linhas for k in l}); cs = ', '.join(ident(c) for c in cols)
            ign = 'ignore-duplicates' in (s.headers.get('Prefer') or '')
            psql(f"insert into public.{t} ({cs}) select {cs} from json_populate_recordset(null::public.{t}, {lit(json.dumps(linhas))}::json)" + (' on conflict do nothing' if ign else ''), cl)
            return s.resp(201)
        if metodo == 'PATCH':
            c = s.corpo(); cols = list(c)
            alvo = ', '.join(ident(x) for x in cols)
            sets = f"({alvo}) = (select {alvo} from json_populate_record(null::public.{t}, {lit(json.dumps(c))}::json))" if len(cols) > 1 else \
                   f"{alvo} = (select {alvo} from json_populate_record(null::public.{t}, {lit(json.dumps(c))}::json))"
            sel = q.get('select', ['*'])[0]
            cols_ret = '*' if sel == '*' else ', '.join(ident(x) for x in sel.split(','))
            r = psql(f"with u as (update public.{t} set {sets}{filtros(q)} returning {cols_ret}) select coalesce(json_agg(u), '[]') from u", cl)
            return s.resp(200, json.loads(r))
        return s.resp(405)
    def do_GET(s):
        if s.path.split('?')[0] == '/js/config.js':
            cfg = (f"window.ISM_CONFIG={{SUPABASE_URL:'http://127.0.0.1:{PORTA}',SUPABASE_ANON_KEY:'anon-teste',"
                   "DOMINIO_LOGIN:'ismpecuaria.app',MINUTOS_INATIVO_COMPARTILHADO:15,SEGUNDOS_SINCRONIA:5};").encode()
            s.send_response(200); s.send_header('Content-Type', 'application/javascript'); s.send_header('Content-Length', str(len(cfg))); s.end_headers(); s.wfile.write(cfg); return
        if s.api('GET') is False: super().do_GET()
    def do_POST(s):
        if s.api('POST') is False: s.resp(404)
    def do_PATCH(s): s.api('PATCH')
    def do_PUT(s): s.api('PUT')
    def do_DELETE(s): s.resp(204)

ThreadingHTTPServer(('127.0.0.1', PORTA), H).serve_forever()
