"""Synthetic stress data for the layout audit. Every value is made up; nothing is read from live data.

Datasets:
  stress  540 clients across every stage, 520 architects, 520 measurement requests,
          long names and notes, values up to Rs 25 crore, many contacts and receipts.
  one     one client, one architect, one measurement request.
  empty   no clients, architects or requests.
"""
from datetime import date, timedelta
import random

TODAY = date(2026, 10, 22)
STAGES = ['qualified', 'design', 'token', 'booked', 'post', 'bin', 'lost']
OWNERS = ['tavneet', 'anushka', 'vaishnavi', 'arjun', 'lang', 'siddharth', 'rahul']
DESIGNERS = ['Ankita', 'Atif', 'Deepanksha', 'Gunjan', 'Jyoti', 'Mansi', 'Mehul', 'Nidhi', 'Rashi', 'Rishabh',
             'Rupa', 'Soma', 'Sudha', 'Vishal']
FIRST = ['Aarav', 'Ishaan', 'Meera', 'Kabir', 'Ananya', 'Rohan', 'Zoya', 'Vikram', 'Nandini', 'Arjun', 'Priya', 'Dev']
LAST = ['Sharma', 'Kapoor', 'Iyer', 'Malhotra', 'Banerjee', 'Reddy', 'Chopra', 'Nair', 'Mehta', 'Gill', 'Rao', 'Sethi']
LONG_NAMES = [
    'Dr. Venkataramanan Subramaniam Iyer-Krishnamurthy & Family Trust (Villa 12B, Phase IV)',
    'Mrs. Parvathy Lakshminarayanan-Chidambaram c/o Sri Sai Balaji Constructions Pvt. Ltd.',
    'Shri Bhupinderjeet Singh Dhillon Grewal and Smt. Harpreet Kaur Dhillon Grewal (Farmhouse)',
    'AVeryLongUnbrokenClientNameWithoutAnySpacesThatMustWrapSomewhereInTheLayout1234567890',
]
CITIES = ['Gurugram', 'New Delhi', 'Noida', 'Faridabad', 'Chandigarh', 'Ludhiana', 'Jaipur',
          'Thiruvananthapuram Cantonment (Kowdiar Gardens Extension)']
PRODUCTS = ['Kitchen', 'Wardrobe', 'Vanity', 'Kitchen + 2 wardrobes', 'Kitchen, third floor, with utility and bar unit']
NOTE = ('Client wants the island moved 300 mm towards the window; confirm chimney duct route with the site '
        'engineer; architect will share the revised electrical layout after Diwali. ')
ARCH_FIRMS = ['Studio Lotus', 'Morphogenesis', 'Abin Design Studio',
              'Raghavendra Venkatesh Associates Architecture, Interiors and Landscape Consultants LLP']


def day(rng, back=90, ahead=90):
    return (TODAY + timedelta(days=rng.randint(-back, ahead))).isoformat()


def name(rng, i):
    if i % 37 == 0:
        return LONG_NAMES[(i // 37) % len(LONG_NAMES)]
    return '%s %s' % (rng.choice(FIRST), rng.choice(LAST))


def value(rng, i):
    # Mostly lakhs, with a tail of crores up to Rs 25 crore so money columns hit their widest.
    if i % 23 == 0:
        return rng.randint(5_00_00_000, 25_00_00_000)
    return rng.randint(1_50_000, 95_00_000)


def client(rng, i, stage):
    cid = 'qa-%04d' % i
    products = [{'product': rng.choice(PRODUCTS), 'value': value(rng, i)} for _ in range(rng.randint(1, 4))]
    received = day(rng, 180, 0)
    total = sum(p['value'] for p in products)
    receipts = []
    if stage in ('token', 'booked', 'post'):
        for n in range(rng.randint(1, 8 if i % 11 == 0 else 3)):
            receipts.append({'amount': max(1000, total // rng.randint(4, 20)), 'date': day(rng, 120, 0),
                             'mode': rng.choice(['Token', 'Bank transfer', 'Cheque', 'UPI']),
                             'ref': 'QA-REF-%05d-%d' % (i, n), 'kind': 'bank',
                             'status': rng.choice(['Confirmed', 'Confirmed', 'Pending', 'Rejected']),
                             'decidedAt': day(rng, 60, 0), 'by': 'QA Accounts'})
    contacts = [{'at': day(rng, 60, 0) + 'T10:00:00Z', 'type': rng.choice(['Call', 'WhatsApp', 'Visit']),
                 'outcome': rng.choice(['Spoke to client', 'Message sent', 'Client replied', 'No answer']),
                 'note': (NOTE * rng.randint(1, 4))[:rng.randint(20, 600)], 'next': day(rng, 0, 30)}
                for _ in range(rng.randint(0, 15 if i % 9 == 0 else 3))]
    proposals = [{'v': v + 1, 'amount': total + v * 25_000, 'status': rng.choice(['With client', 'Approved', 'Revise']),
                  'receivedAt': day(rng, 90, 0)} for v in range(rng.randint(0, 5))] if stage != 'qualified' else []
    c = {
        'id': cid, 'name': name(rng, i), 'phone': '9%09d' % i, 'city': rng.choice(CITIES),
        'product': products[0]['product'], 'source': rng.choice(['Walk-in', 'Architect reference', 'Social media',
                                                                  'Referral', 'Not recorded']),
        'pid': 'P-%05d' % (70000 + i), 'cid': 'C-%05d' % (70000 + i), 'owner': OWNERS[(i // 7) % len(OWNERS)],
        'stage': stage, 'receivedAt': received + 'T09:30:00Z', 'spokeAt': received + 'T11:00:00Z',
        'priority': rng.choice(['High', 'Medium', 'Low', '']),
        'budget': rng.choice(['Rs 20 to 25 L', 'Rs 55 to 60 L', 'Rs 1.2 to 1.5 Cr', '']),
        'note': (NOTE * 6)[:rng.choice([0, 40, 250, 900])],
        'design': {'designer': rng.choice(DESIGNERS), 'step': rng.choice(['drf', 'withDesign', 'toShare', 'withClient']),
                   'stepAt': day(rng, 30, 0), 'brief': {'kitchenType': []}, 'proposals': proposals,
                   'revisions': [{'ofVersion': v + 1, 'at': day(rng, 30, 0), 'reason': rng.choice(['Client wants a bigger island', 'Change shutter colour', 'Move the tall unit to the left wall and add a pantry pull-out']),
                                 'by': 'QA Sales', 'notes': NOTE[:120], 'file': ''} for v in range(rng.randint(0, 3))]},
        'order': {'products': products, 'md': rng.randint(0, 5), 'freight': rng.choice([0, 15000, 250000]),
                  'bankPct': rng.choice([100, 80, 60]), 'faPct': rng.choice([0, 5, 10])},
        'timeline': {'type': rng.choice(['Standard', 'Custom', 'Express']), 'productionDays': 45,
                     'handover': day(rng, 0, 240),
                     'custom': {'dispatch': day(rng, 0, 200), 'pdi': day(rng, 0, 180), 'signoff': day(rng, 0, 150)}},
        'payment': {'plan': rng.choice(['SM', 'AVP', 'Founder']), 'receipts': receipts,
                    'tokenPlan': rng.choice([25000, 100000, 500000]), 'tokenBy': day(rng, 0, 20),
                    'expectedBy': day(rng, 0, 60)},
        'approvals': {k: rng.choice(['Not sent', 'Pending', 'Approved', 'Rejected']) for k in ('plan', 'timeline', 'booking')},
        'contacts': contacts,
        'validation': {'kitchenType': rng.choice(['Chef', 'Parallel', '']), 'theme': rng.choice(['Modern PG1', ''])},
        'docs': {}, 'billing': [{'id': 'b-' + cid, 'name': 'Billing entity for ' + cid}], 'billingPick': 'b-' + cid, 'gates': {},
    }
    if stage in ('booked', 'post'):
        c['bookedAt'] = day(rng, 90, 0)
        c['approvedAt'] = day(rng, 100, 0)
        if i % 2:
            c['gates'] = {'design': {'at': day(rng, 60, 0), 'by': 'QA Accounts'}}
    if stage == 'post':
        log = [{'at': day(rng, 40, 0), 'what': 'Site measurement done', 'note': NOTE[:rng.randint(10, 200)]}
               for _ in range(rng.randint(0, 6))]
        c['post'] = {'ept': {'step': rng.choice(['Site measurement done', 'Client signed the EPT',
                                                 'Client asked for changes', '']), 'log': log},
                     'appliances': {'items': [{'at': day(rng, 30, 0), 'make': 'Siemens iQ700 Series', 'name': 'Built-in oven',
                                               'note': NOTE[:80]} for _ in range(rng.randint(0, 6))], 'log': log},
                     'design': {'log': log}, 'pdi': {'log': log}, 'sample': bool(i % 3)}
    if stage == 'bin':
        c['binned'] = {'at': day(rng, 30, 0), 'stage': rng.choice(['qualified', 'design'])}
    if i % 13 == 0:
        c['architectInvolved'] = True
        c['architectId'] = 'qa-arch-%04d' % (i % 520)
        c['order']['archPct'] = 5
    return c


def architect(i):
    long = i % 29 == 0
    return {'id': 'qa-arch-%04d' % i,
            'name': ('Ar. Padmanabhan Ramaswamy Venkatachalapathy' if long else 'Ar. %s %s' % (FIRST[i % 12], LAST[(i * 5) % 12])),
            'firm': ARCH_FIRMS[3] if long else ARCH_FIRMS[i % 3], 'phone': '8%09d' % i, 'rate': (i % 4) * 2.5}


def measurement(i):
    stage = ['First Measurement', 'EPT Marking', 'EPT Verification', 'PDI'][i % 4]
    client_name = LONG_NAMES[i % 4] if i % 31 == 0 else 'QA Measurement %d %s' % (i, LAST[i % 12])
    return dict(id='qa-request-%d' % i, stage=stage, client=client_name,
                status=['To Schedule', 'Scheduled', 'Done', 'Cancelled'][i % 4],
                date=(TODAY + timedelta(days=(i % 40) - 10)).isoformat(),
                assigned_person=['QA Measurer', 'Ravindra Kumar Chaurasia (Senior Site Engineer)'][i % 2],
                owner=OWNERS[i % 7].title(), coordinates=[28.4 + (i % 50) / 100, 77.0 + (i % 40) / 100],
                modified_at='2026-10-21T06:00:00Z')


def build(kind):
    """Return (snapshot, measurement_requests)."""
    rng = random.Random(20261022)
    if kind == 'empty':
        return {'rev': 0, 'clients': [], 'architects': [], 'note': ''}, []
    if kind == 'one':
        return ({'rev': 0, 'clients': [client(rng, 1, 'booked')], 'architects': [architect(1)], 'note': ''},
                [measurement(1)])
    clients = [client(rng, i, STAGES[i % len(STAGES)]) for i in range(1, 541)]
    note = 'Office note for the whole team. ' * 12
    return ({'rev': 0, 'clients': clients, 'architects': [architect(i) for i in range(520)], 'note': note},
            [measurement(i) for i in range(520)])
