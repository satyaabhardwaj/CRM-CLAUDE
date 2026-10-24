"""Measurement visits run by the CRM itself (Manish, 23 Oct 2026), instead of being read from Zoho.

Where the data lives (no new tables; the CRM keeps lossless JSON documents):
  workspace payload `measurement`  {team: [...], checklists: {eptVerification: [...], pdi: [...]}, pdiFields: [...]}
  client payload    `visits`        one record per visit (four types), with checklist results, snags and photos
  client payload    `visitBudget`   {visits, rate} copied from the estimate's "Site Visit Charges" line
  client payload    `site`          {location, supervisor, supervisorPhone, clientPhone} typed by the designer or Sales
  client payload    `siteAsk`       {at, by, missing} when Measurement asks Sales and the designer for missing site details

The given date (24 Oct 2026): the date Sales or the designer asked for is the visit's `givenDate`. Measurement may pick
another date only through a special approval: the visit keeps the given date and carries `dateChange` {from, to, reason,
status} until an admin approves (the date moves) or rejects it.

Who may do what:
  admin                 sees the board, creates and assigns visits, approves revisits, edits team and checklists
  reader                sees the board
  a measurement person  (any login linked to a team member) sees only their own visits and the site details for them,
                        accepts or declines, fills the checklist with photos, lists snags and marks the visit done
Nothing here is sample data; the team, checklists and visits start empty.
"""
import time
import uuid
from fastapi import HTTPException, Request
from sqlalchemy import select, update
from starlette.concurrency import run_in_threadpool
from core.server import safe_name
from . import repository
from .models import clients, state
from .storage import Attachments

TYPES = ('first', 'eptMarking', 'eptVerification', 'pdi')
GRADES = ('', 'poor', 'good', 'excellent')
FAULTS = ('', 'client', 'magppie')
STATUSES = ('requested', 'assigned', 'accepted', 'declined', 'done', 'cancelled')
# Site details a measurement person needs for an assigned visit; nothing else of the client leaves the server.
SITE_KEYS = ('name', 'pid', 'cid', 'city', 'pin', 'siteAddress', 'siteType', 'product')
# Site details Measurement may ask Sales and the designer for.
ASKABLE = ('siteAddress', 'clientPhone', 'supervisor', 'supervisorPhone')


def now(): return time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())


def text(value, limit=500):
    if value is None: return ''
    if not isinstance(value, (str, int, float)) or isinstance(value, bool): raise HTTPException(422, 'Invalid text value.')
    return str(value).strip()[:limit]


def settings_of(payload):
    m = payload.get('measurement') if isinstance(payload.get('measurement'), dict) else {}
    checklists = m.get('checklists') if isinstance(m.get('checklists'), dict) else {}
    return {'team': m.get('team') if isinstance(m.get('team'), list) else [],
            'checklists': {k: checklists.get(k) if isinstance(checklists.get(k), list) else [] for k in ('eptMarking', 'eptVerification', 'pdi')},
            'pdiFields': m.get('pdiFields') if isinstance(m.get('pdiFields'), list) else []}


def clean_settings(body):
    if not isinstance(body, dict): raise HTTPException(422, 'Invalid settings.')
    team, seen = [], set()
    for row in body.get('team') or []:
        if not isinstance(row, dict): raise HTTPException(422, 'Invalid team member.')
        member_id = text(row.get('id'), 60) or uuid.uuid4().hex[:12]
        if member_id in seen: raise HTTPException(422, 'Team member IDs must be unique.')
        seen.add(member_id)
        skills = row.get('skills') if isinstance(row.get('skills'), dict) else {}
        if any(skills.get(t, '') not in GRADES for t in TYPES): raise HTTPException(422, 'Invalid skill grade.')
        team.append({'id': member_id, 'name': text(row.get('name'), 120), 'email': text(row.get('email'), 320).lower(),
                     'phone': text(row.get('phone'), 40), 'skills': {t: skills.get(t, '') for t in TYPES},
                     'ncrOnly': bool(row.get('ncrOnly')), 'active': row.get('active', True) is not False})
    def items(rows, kind):
        out, ids = [], set()
        for row in rows or []:
            if not isinstance(row, dict) or not text(row.get('text'), 300): raise HTTPException(422, 'Every ' + kind + ' needs text.')
            item_id = text(row.get('id'), 60) or uuid.uuid4().hex[:12]
            if item_id in ids: raise HTTPException(422, 'Duplicate ' + kind + ' ID.')
            ids.add(item_id)
            out.append({'id': item_id, 'text': text(row.get('text'), 300), 'photo': bool(row.get('photo'))})
        return out
    lists = body.get('checklists') if isinstance(body.get('checklists'), dict) else {}
    return {'team': team, 'checklists': {k: items(lists.get(k), 'checklist item') for k in ('eptMarking', 'eptVerification', 'pdi')},
            'pdiFields': items(body.get('pdiFields'), 'PDI field')}


def budget(c):
    b = c.get('visitBudget') if isinstance(c.get('visitBudget'), dict) else {}
    visits = b.get('visits') if isinstance(b.get('visits'), int) and b.get('visits') >= 0 else None
    rate = b.get('rate') if isinstance(b.get('rate'), (int, float)) and not isinstance(b.get('rate'), bool) and b.get('rate') >= 0 else None
    used = len([v for v in c.get('visits') or [] if isinstance(v, dict) and v.get('status') not in ('cancelled', 'declined')])
    over = max(0, used - visits) if visits is not None else 0
    return {'visits': visits, 'rate': rate, 'used': used, 'over': over, 'overAmount': over * rate if rate is not None else None}


def mirror_first(c, v):
    """Design's post-design step 1 reads client.measurement (Sent, Aligned, Done). A first measurement keeps it in step."""
    if v.get('type') != 'first' or v.get('revisit'): return
    m = c['measurement'] if isinstance(c.get('measurement'), dict) else {'requestedAt': v.get('createdAt') or now(), 'date': '', 'by': 'Measurement'}
    if v.get('date'): m['date'] = v['date']
    if v.get('assigneeName'): m['assignee'] = v['assigneeName']
    if v.get('status') in ('assigned', 'accepted', 'done') and not m.get('alignedAt'): m['alignedAt'] = now()
    if v.get('status') == 'done' and not m.get('doneAt'): m['doneAt'] = v.get('doneAt') or now()
    m['changedAt'] = now()
    c['measurement'] = m


def register(app, engine, settings, who):
    files = Attachments(settings)

    def load(db):
        row = db.execute(select(state.c.payload).where(state.c.id == 1)).scalar_one_or_none()
        if row is None: raise HTTPException(503, 'Database has not been imported.')
        return row

    def member_of(payload, user, db):
        from .models import credentials
        email = db.execute(select(credentials.c.email).where(credentials.c.user_id == user['id'])).scalar_one_or_none()
        for m in settings_of(payload)['team']:
            if m.get('active') and (m.get('userId') == user['id'] or (email and m.get('email') == email.lower())):
                return m
        return None

    def workspace(db, request, write=False):
        user = who(db, request)
        if user['role'] not in ('admin', 'reader'): raise HTTPException(403, 'Measurement board requires workspace access.')
        if write and user['role'] != 'admin': raise HTTPException(403, 'Administrator access required.')
        return user

    def client_row(db, client_id):
        row = db.execute(select(clients).where(clients.c.id == client_id).with_for_update()).mappings().first()
        if not row: raise HTTPException(404, 'Client not found.')
        return row

    def save(db, row, payload, user, action):
        db.execute(update(state).where(state.c.id == 1).values(rev=state.c.rev + 1))
        db.execute(update(clients).where(clients.c.id == row['id'], clients.c.version == row['version']).values(payload=payload, version=row['version'] + 1))
        repository.event(db, user['id'], action, row['id'])

    def find(payload, visit_id):
        for v in payload.get('visits') or []:
            if isinstance(v, dict) and v.get('id') == visit_id: return v
        raise HTTPException(404, 'Visit not found.')

    def news(c, line, tone='blue'):
        c['news'] = ([{'at': now(), 'text': line, 'tone': tone, 'from': 'Measurement'}] + (c.get('news') or []))[:20]

    def person(db, user):
        """A readable name for who did something: the login email's first part (satveer@... -> Satveer)."""
        from .models import credentials
        email = db.execute(select(credentials.c.email).where(credentials.c.user_id == user['id'])).scalar_one_or_none()
        return (email.split('@')[0].replace('.', ' ').title() if email else user['id'])[:120]

    def set_date(v, body, name):
        """Measurement's date for a visit. Away from the given date it needs a reason and goes for special approval."""
        if 'date' not in body: return
        new, given = text(body.get('date'), 10), v.get('givenDate') or ''
        pending = v.get('dateChange') if (v.get('dateChange') or {}).get('status') == 'pending' else None
        if not given or not new or new == given:
            v['date'] = new or given
            if pending: v.pop('dateChange')
            return
        if pending and pending.get('to') == new: return
        reason = text(body.get('dateReason'), 500)
        if not reason: raise HTTPException(422, 'Changing the given date needs a reason; it goes for special approval.')
        v['date'] = given
        v['dateChange'] = {'status': 'pending', 'from': given, 'to': new, 'reason': reason, 'at': now(), 'by': name}

    @app.get('/api/measurement/board')
    def board(request: Request):
        with engine.connect() as db:
            user = workspace(db, request)
            payload = load(db)
            rows = []
            for c in db.execute(select(clients.c.payload).order_by(clients.c.position)).scalars():
                if not isinstance(c, dict) or c.get('stage') in ('bin', 'lost'): continue
                # Booked and post-design clients can get a visit; earlier ones only once something was requested.
                if c.get('stage') not in ('token', 'booked', 'post') and not c.get('visits') and not c.get('measurement'): continue
                rows.append({**{k: c.get(k) for k in ('id', 'owner', 'stage', 'state', 'siteContact', 'phone', 'docs', 'visits', 'measurement', 'site', 'siteAsk', 'visitBudget', 'design') + SITE_KEYS},
                             'budget': budget(c)})
            return {'settings': settings_of(payload), 'clients': rows, 'me': user['id'], 'role': user['role']}

    @app.put('/api/measurement/settings')
    async def put_settings(request: Request):
        body = await request.json()
        clean = clean_settings(body)
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            previous = settings_of(load(db))
            # Logins stay linked when a member is edited; members are archived, never removed, so history keeps its names.
            links = {m.get('id'): m.get('userId') for m in previous['team'] if m.get('userId')}
            ids = {m['id'] for m in clean['team']}
            if not {m.get('id') for m in previous['team']}.issubset(ids): raise HTTPException(422, 'Removing team members is disabled; mark them inactive.')
            for m in clean['team']:
                if links.get(m['id']): m['userId'] = links[m['id']]
            payload = dict(load(db))
            payload['measurement'] = clean
            db.execute(update(state).where(state.c.id == 1).values(payload=payload, rev=state.c.rev + 1))
            repository.event(db, user['id'], 'measurement.settings')
        return clean

    @app.post('/api/measurement/visits/{client_id}')
    async def create_visit(client_id: str, request: Request):
        body = await request.json()
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            team = {m['id']: m for m in settings_of(load(db))['team']}
            row = client_row(db, client_id)
            c = dict(row['payload'])
            kind = body.get('type')
            if kind not in TYPES: raise HTTPException(422, 'Choose the visit type.')
            # Measurement never starts a visit by itself (Manish, 24 Oct 2026): Sales sends the first measurement once,
            # through the special approval, and the designer asks for everything else. This only turns a first
            # measurement request (client.measurement) into its visit.
            asked_first = isinstance(c.get('measurement'), dict) and c['measurement'].get('requestedAt')
            has_first = any(isinstance(x, dict) and x.get('type') == 'first' and not x.get('revisit') and x.get('status') != 'cancelled' for x in c.get('visits') or [])
            if kind != 'first' or body.get('revisit') or not asked_first or has_first:
                raise HTTPException(403, 'Visits come from Sales (special approval) or the designer; Measurement plans them.')
            fault, revisit = '', False
            name = person(db, user)
            asked = c.get('measurement') if kind == 'first' and not revisit and isinstance(c.get('measurement'), dict) else {}
            v = {'id': uuid.uuid4().hex[:16], 'type': kind, 'status': 'requested', 'createdAt': now(), 'createdBy': user['id'],
                 'createdByName': name, 'askedBy': asked.get('by') or 'Measurement', 'givenDate': text(asked.get('date'), 10),
                 'date': '', 'note': text(body.get('note'), 1000), 'revisit': revisit,
                 'reason': text(body.get('reason'), 1000), 'fault': fault, 'checklist': {}, 'snags': [], 'photos': [], 'fields': {}}
            if revisit: v['approval'] = {'status': 'pending', 'at': now()}
            set_date(v, {'date': text(body.get('date'), 10), 'dateReason': body.get('dateReason')}, name)
            assign(v, body, team, name)
            c['visits'] = (c.get('visits') or []) + [v]
            mirror_first(c, v)
            news(c, ('Revisit' if revisit else 'Visit') + ' created: ' + kind)
            save(db, row, c, user, 'measurement.visit.create')
        return v

    def assign(v, body, team, name):
        for key in ('assigneeId', 'assistantId'):
            if key in body:
                member = team.get(body.get(key) or '')
                if body.get(key) and not member: raise HTTPException(422, 'Unknown team member.')
                if key == 'assigneeId' and member and member['id'] != v.get('assigneeId'):
                    v['assignedBy'], v['assignedAt'] = name, now()
                v[key] = member['id'] if member else ''
                v[key.replace('Id', 'Name')] = member['name'] if member else ''
        if v.get('assigneeId') and v.get('status') == 'requested': v['status'] = 'assigned'

    @app.post('/api/measurement/visits/{client_id}/{visit_id}')
    async def change_visit(client_id: str, visit_id: str, request: Request):
        body = await request.json()
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            team = {m['id']: m for m in settings_of(load(db))['team']}
            row = client_row(db, client_id)
            c = dict(row['payload'])
            v = find(c, visit_id)
            name = person(db, user)
            # First measurements made before the given date existed take it from the request.
            if 'givenDate' not in v and v.get('type') == 'first' and not v.get('revisit'):
                v['givenDate'] = text((c.get('measurement') or {}).get('date') if isinstance(c.get('measurement'), dict) else '', 10)
            if 'note' in body: v['note'] = text(body.get('note'), 1000)
            set_date(v, body, name)
            assign(v, body, team, name)
            if body.get('cancel'): v['status'] = 'cancelled'
            if 'approval' in body:
                decision = body.get('approval')
                if not v.get('revisit') or decision not in ('approved', 'rejected'): raise HTTPException(422, 'Only revisits are approved.')
                v['approval'] = {'status': decision, 'by': user['id'], 'at': now(), 'note': text(body.get('approvalNote'), 500)}
                news(c, 'Revisit ' + decision + ' by Founder’s Office')
            if 'dateApproval' in body:
                decision, change = body.get('dateApproval'), v.get('dateChange') or {}
                if change.get('status') != 'pending' or decision not in ('approved', 'rejected'): raise HTTPException(422, 'No date change is waiting.')
                change.update({'status': decision, 'decidedBy': name, 'decidedAt': now(), 'note': text(body.get('approvalNote'), 500)})
                if decision == 'approved': v['date'] = v['givenDate'] = change['to']
                news(c, 'New visit date ' + change['to'] + ' ' + decision + ' (special approval)', 'green' if decision == 'approved' else 'red')
            mirror_first(c, v)
            save(db, row, c, user, 'measurement.visit.change')
        return v

    @app.put('/api/measurement/budget/{client_id}')
    async def put_budget(client_id: str, request: Request):
        body = await request.json()
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            row = client_row(db, client_id)
            c = dict(row['payload'])
            visits, rate = body.get('visits'), body.get('rate')
            if visits is not None and (not isinstance(visits, int) or isinstance(visits, bool) or not 0 <= visits <= 50): raise HTTPException(422, 'Visits must be 0 to 50.')
            if rate is not None and (not isinstance(rate, (int, float)) or isinstance(rate, bool) or not 0 <= rate <= 1_000_000): raise HTTPException(422, 'Invalid rate.')
            c['visitBudget'] = {'visits': visits, 'rate': rate}
            save(db, row, c, user, 'measurement.budget')
        return budget(c)

    @app.put('/api/measurement/site/{client_id}')
    async def put_site(client_id: str, request: Request):
        body = await request.json()
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            row = client_row(db, client_id)
            c = dict(row['payload'])
            site = dict(c.get('site') or {})
            for key, limit in (('location', 500), ('supervisor', 120), ('supervisorPhone', 40), ('clientPhone', 40)):
                if key in body: site[key] = text(body.get(key), limit)
            c['site'] = site
            if 'siteAddress' in body: c['siteAddress'] = text(body.get('siteAddress'), 500)
            save(db, row, c, user, 'measurement.site')
        return c['site']

    @app.post('/api/measurement/ask/{client_id}')
    async def ask_site(client_id: str, request: Request):
        """Measurement asks Sales and the designer for site details that are missing; they see it on the client."""
        body = await request.json()
        missing = body.get('missing') if isinstance(body.get('missing'), list) else []
        if not missing or any(m not in ASKABLE for m in missing): raise HTTPException(422, 'Say which site details are missing.')
        with engine.begin() as db:
            user = workspace(db, request, write=True)
            row = client_row(db, client_id)
            c = dict(row['payload'])
            c['siteAsk'] = {'at': now(), 'by': person(db, user), 'missing': list(dict.fromkeys(missing))}
            words = {'siteAddress': 'site address', 'clientPhone': 'client number', 'supervisor': 'site supervisor', 'supervisorPhone': 'site supervisor number'}
            news(c, 'Measurement asks for: ' + ', '.join(words[m] for m in c['siteAsk']['missing']), 'red')
            save(db, row, c, user, 'measurement.site.ask')
        return c['siteAsk']

    # ---- The measurement person's own page (phone) ----
    def mine_filter(db, request):
        user = who(db, request)
        payload = load(db)
        member = member_of(payload, user, db)
        if not member: raise HTTPException(403, 'This login is not on the measurement team.')
        return user, member, payload

    @app.get('/api/measurement/mine')
    def mine(request: Request):
        with engine.connect() as db:
            user, member, payload = mine_filter(db, request)
            out = []
            for c in db.execute(select(clients.c.payload).order_by(clients.c.position)).scalars():
                if not isinstance(c, dict) or c.get('stage') in ('bin', 'lost'): continue
                for v in c.get('visits') or []:
                    if isinstance(v, dict) and member['id'] in (v.get('assigneeId'), v.get('assistantId')) and v.get('status') not in ('cancelled',):
                        out.append({'client': {**{k: c.get(k) for k in ('id',) + SITE_KEYS}, 'site': {**(c.get('site') or {}), 'clientPhone': (c.get('site') or {}).get('clientPhone') or c.get('phone') or ''},
                                               'siteContact': c.get('siteContact') or '', 'drawing': (c.get('docs') or {}).get('drawing') or '',
                                               'designer': (c.get('design') or {}).get('designer') or ''},
                                    'visit': v, 'lead': v.get('assigneeId') == member['id']})
            return {'member': {'id': member['id'], 'name': member['name']}, 'visits': out, 'checklists': settings_of(payload)['checklists'],
                    'pdiFields': settings_of(payload)['pdiFields']}

    @app.post('/api/measurement/mine/{client_id}/{visit_id}')
    async def mine_action(client_id: str, visit_id: str, request: Request):
        body = await request.json()
        with engine.begin() as db:
            user, member, payload = mine_filter(db, request)
            row = client_row(db, client_id)
            c = dict(row['payload'])
            v = find(c, visit_id)
            if v.get('assigneeId') != member['id']: raise HTTPException(403, 'Only the person this visit is assigned to can change it.')
            if v.get('status') in ('cancelled', 'done') and body.get('action') != 'reopen': raise HTTPException(409, 'This visit is closed.')
            action = body.get('action')
            if action == 'accept': v['status'] = 'accepted'; v['acceptedAt'] = now(); news(c, member['name'] + ' accepted the ' + v['type'] + ' visit')
            elif action == 'decline': v['status'] = 'declined'; v['declinedAt'] = now(); v['declineReason'] = text(body.get('reason'), 500); news(c, member['name'] + ' declined the ' + v['type'] + ' visit')
            elif action == 'save' or action == 'done':
                kinds = settings_of(payload)
                allowed_items = {i['id'] for i in kinds['checklists'].get(v['type'], [])} if v['type'] in ('eptMarking', 'eptVerification', 'pdi') else set()
                results = body.get('checklist') if isinstance(body.get('checklist'), dict) else {}
                for item_id, r in results.items():
                    if item_id not in allowed_items or not isinstance(r, dict) or r.get('state') not in ('', 'ok', 'wrong', 'notReady'): raise HTTPException(422, 'Invalid checklist answer.')
                    v['checklist'][item_id] = {'state': r.get('state', ''), 'note': text(r.get('note'), 500), 'photo': text(r.get('photo'), 200)}
                if 'snags' in body:
                    if not isinstance(body['snags'], list): raise HTTPException(422, 'Invalid snag list.')
                    v['snags'] = [{'text': text(s.get('text'), 500), 'fixed': bool(s.get('fixed'))} for s in body['snags'] if isinstance(s, dict) and text(s.get('text'), 500)]
                if 'fields' in body and v['type'] == 'pdi':
                    known = {f['id'] for f in kinds['pdiFields']}
                    if not isinstance(body['fields'], dict) or not set(body['fields']).issubset(known): raise HTTPException(422, 'Invalid PDI field.')
                    v['fields'] = {k: text(val, 500) for k, val in body['fields'].items()}
                if 'note' in body: v['visitNote'] = text(body.get('note'), 1000)
                if action == 'done':
                    v['status'] = 'done'; v['doneAt'] = now()
                    news(c, member['name'] + ' finished the ' + v['type'] + ' visit' + (' · ' + str(len(v['snags'])) + ' snag(s)' if v['snags'] else ''))
            elif action == 'reopen':
                if v.get('status') != 'done': raise HTTPException(409, 'Only a finished visit can be reopened.')
                v['status'] = 'accepted'; v.pop('doneAt', None)
            else: raise HTTPException(422, 'Unknown action.')
            mirror_first(c, v)
            save(db, row, c, user, 'measurement.mine.' + action)
        return v

    @app.put('/api/measurement/mine/{client_id}/{visit_id}/photo/{name}')
    async def mine_photo(client_id: str, visit_id: str, name: str, request: Request):
        data = await request.body()
        if not 0 < len(data) <= 15 * 1024 * 1024: raise HTTPException(413, 'A photo can be up to 15 MB.')
        with engine.connect() as db:
            user, member, payload = mine_filter(db, request)
            c = db.execute(select(clients.c.payload).where(clients.c.id == client_id)).scalar_one_or_none()
            if not c: raise HTTPException(404, 'Client not found.')
            v = find(c, visit_id)
            if v.get('assigneeId') != member['id']: raise HTTPException(403, 'Only the person this visit is assigned to can add photos.')
        clean = safe_name('visit-' + visit_id + '-' + uuid.uuid4().hex[:6] + '-' + name)
        await run_in_threadpool(files.put, client_id, clean, data)
        with engine.begin() as db:
            row = client_row(db, client_id)
            c = dict(row['payload'])
            v = find(c, visit_id)
            v['photos'] = (v.get('photos') or []) + [{'name': clean, 'at': now()}]
            save(db, row, c, user, 'measurement.mine.photo')
        return {'name': clean}

    @app.get('/api/measurement/mine/{client_id}/file/{name}')
    def mine_file(client_id: str, name: str, request: Request):
        """A measurement person may open the drawing and the photos of their own visits, nothing else of the client."""
        from fastapi.responses import FileResponse, RedirectResponse
        with engine.connect() as db:
            user, member, payload = mine_filter(db, request)
            c = db.execute(select(clients.c.payload).where(clients.c.id == client_id)).scalar_one_or_none()
            if not c: raise HTTPException(404, 'Client not found.')
            mine_visits = [v for v in c.get('visits') or [] if isinstance(v, dict) and member['id'] in (v.get('assigneeId'), v.get('assistantId'))]
            names = {(c.get('docs') or {}).get('drawing')} | {p.get('name') for v in mine_visits for p in v.get('photos') or [] if isinstance(p, dict)}
            if not mine_visits or name not in names: raise HTTPException(404, 'File not found.')
        if settings.storage_backend == 'supabase':
            return RedirectResponse(files.signed_download(client_id, name), status_code=307)
        target = files.path(client_id, name)
        if not target.is_file(): raise HTTPException(404, 'File not found.')
        return FileResponse(target, filename=name, headers={'Content-Security-Policy': 'sandbox'})
