"""Read-only Zoho CRM adapter. Secrets and OAuth tokens never reach the browser."""
import asyncio
import os
import re
import math
import time
from datetime import datetime, timezone, timedelta, date as calendar_date

def map_location(record):
    return {"map_coordinates": record.get("coordinates"), "map_location_kind": "exact" if record.get("coordinates") else "missing"}

STAGES = {
    'First Measurement': ('Measurement', 'Aligned_Visit_Date', 'Expected_Visit_Date'),
    'EPT Marking': ('EPT_Marking', 'Aligned_EPTCG_Visit_Date', 'Expected_EPTCG_Visit_Date'),
    'EPT Verification': ('EPT_Verification', 'Aligned_Electrical_Plumbering_Date', 'Expected_Electrical_Plumbering_Date'),
    'PDI': ('PDI_Visit', 'Aligned_PDI_date', 'Expected_PDI_date'),
}
# Exact CRM Stage values; deliberately no fuzzy matching of sales/design stages.
WORKFLOW_STAGES = {
    'First Measurement': {
        'Query to SM', 'Request for Site Visit', 'Align First Measurement', 'Revisit Req-First Measurement',
    },
    'EPT Marking': {
        'EP Marking', 'Request for Electric and Plumbing Marking',
        'Electric/Plumbing Marking Aligned',
    },
    'EPT Verification': {
        'EP Verification', 'Request for Electric Plumbing Checking', 'Electric/Plumbing Checking',
    },
    'PDI': {'Prepare PDI', 'Align PDI', 'PDI', 'PDI1', 'PDI Verifiction'},
}
COMPLETED_STAGES = {
    'First Measurement': {'First Measurement Done', 'First Measurement Approved'},
    'EPT Marking': {'Electric/Plumbing Marking Done', 'Electric/Plumbing Marketing Done'},
    'EPT Verification': {'Electric/Plumbing Checking Done'},
    'PDI': {'PDI Done'},
}
FOLLOW_UP_STAGES = {'Revisit Req-First Measurement'}
INDIA_TIME = timezone(timedelta(hours=5, minutes=30))

BASE_FIELDS = ['Deal_Name', 'Opportunity_Name', 'Owner', 'Stage', 'Shipping_Address',
               'Shipping_Address_City', 'Shipping_Address_Coordinates_Latitude',
               'Shipping_Address_Coordinates_Longitude', 'Shipping_Address_Coordinates', 'Site_Measurement_Person',
               'Shipping_Address_State_Province', 'city', 'State',
               'Shipping_Address_Street_Address', 'Shipping_Address_Flat_House_No_Building_Apartment',
               'Shipping_Address_Zip_Postal_Code', 'Zone', 'Product_Name', 'Modified_Time', 'Stage_Modified_Time']
FIELDS = BASE_FIELDS + [field for prefix, aligned, expected in STAGES.values()
                        for field in [prefix+'_open', prefix+'_received', prefix+'_done', aligned, expected]]


class ZohoError(Exception):
    pass


def label(value, default=''):
    return (value.get('name') or default) if isinstance(value, dict) else str(value or default)


def location_value(record, *fields):
    for field in fields:
        value = label(record.get(field)).strip()
        if value and value.lower() not in {'-none-', 'none', 'null', 'n/a', '-'}:
            return value
    return ''


def site_address(record):
    # Preserve the actual shipping address; never substitute a billing/client address.
    parts = [location_value(record, field) for field in [
        'Shipping_Address_Flat_House_No_Building_Apartment',
        'Shipping_Address_Street_Address', 'Shipping_Address_Zip_Postal_Code']]
    address = location_value(record, 'Shipping_Address')
    return ', '.join(dict.fromkeys([p for p in parts if p]+([address] if address else [])))


def coordinates(record):
    """Read explicit site coordinates only; never geocode or use billing addresses."""
    def valid(lat, lng):
        try:
            lat, lng = float(lat), float(lng)
            # 0,0 is Zoho's empty coordinate pair (open sea off West Africa), never a real site.
            return [lat, lng] if math.isfinite(lat) and math.isfinite(lng) and -90 <= lat <= 90 and -180 <= lng <= 180 and (lat or lng) else None
        except (TypeError, ValueError):
            return None
    pair = valid(record.get('Shipping_Address_Coordinates_Latitude'), record.get('Shipping_Address_Coordinates_Longitude'))
    if pair:
        return pair
    # Zoho also exposes the same shipping coordinate pair as a combined field.
    # Accept only an explicit latitude,longitude pair, not free text or map viewport URLs.
    combined = str(record.get('Shipping_Address_Coordinates') or '').strip()
    number = r'[+-]?(?:\d+(?:\.\d+)?|\.\d+)'
    match = re.fullmatch(r'\s*('+number+r')\s*,\s*('+number+r')\s*', combined)
    return valid(*match.groups()) if match else None


def normalize(record, today=None):
    """Use the current CRM workflow, not old dates, to identify active visits.

    Explicit timestamps remain usable when no workflow stage is supplied. Historical
    completed timestamps stay available, but never manufacture a completion date.
    """
    result = []
    today = today or datetime.now(INDIA_TIME).date()
    workflow = label(record.get('Stage')).strip()
    for stage, (prefix, aligned, expected) in STAGES.items():
        opened, received, done = (record.get(prefix+'_'+suffix) for suffix in ['open', 'received', 'done'])
        active = workflow in WORKFLOW_STAGES[stage]
        complete = workflow in COMPLETED_STAGES[stage]
        if not (active or complete or done or (not workflow and (opened or received))):
            continue
        try:
            visit_day = calendar_date.fromisoformat(str(record.get(aligned))[:10])
        except (ValueError, TypeError):
            visit_day = None
        date = visit_day.isoformat() if visit_day else None
        # A prior completion/date must not close or schedule a newly requested visit.
        request_time = record.get('Stage_Modified_Time') if active else opened or received
        request_day = str(request_time)[:10] if request_time else None
        current_booking = visit_day is not None and visit_day >= today and (not request_day or date >= request_day)
        completed = complete or (bool(done) and not active)
        status = 'Completed' if completed else 'Scheduled' if current_booking else 'To Schedule'
        follow_up = active and workflow in FOLLOW_UP_STAGES
        result.append({
            'id': str(record['id']) + ':' + prefix, 'record_id': str(record['id']),
            'client': label(record.get('Opportunity_Name'), label(record.get('Deal_Name'), 'Unnamed client')),
            'order': label(record.get('Deal_Name')), 'city': location_value(record, 'Shipping_Address_City', 'city') or 'City not added',
            'address': site_address(record) or 'Address not added', 'coordinates': coordinates(record),
            'stage': stage, 'status': status, 'crm_stage': workflow,
            'request_bucket': None if completed else 'follow_up' if follow_up else 'received',
            'schedule_note': 'Past visit date — needs a new date' if not completed and visit_day and visit_day < today else '',
            'date': date, 'expected_date': record.get(expected), 'completed_date': done if completed else None,
            'assignee': label(record.get('Site_Measurement_Person'), label(record.get('Owner'), 'Unassigned')),
            'requested_at': opened or received, 'source': 'zoho',
            'assigned_person': label(record.get('Site_Measurement_Person')),
            'opened_at': opened, 'received_at': received,
            'state': location_value(record, 'Shipping_Address_State_Province', 'State'),
            'zone': label(record.get('Zone')), 'product': label(record.get('Product_Name')),
            'owner': label(record.get('Owner')), 'modified_at': record.get('Modified_Time'),
        })
    for item in result:
        item.update(map_location(item))
    return result


