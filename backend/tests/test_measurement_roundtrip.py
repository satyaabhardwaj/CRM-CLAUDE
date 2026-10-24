"""Measurement persistence contract on the active FastAPI store endpoint."""
from backend.tests.test_api import api, sign_in


def test_measurement_tasks_roundtrip_preserves_unknown_fields_and_rejects_stale(api):
    client, _, _ = api
    sign_in(client)
    data = client.get('/api/store').json()
    original = data['clients'][0].copy()
    data['clients'][0]['measurementVisits'] = {'pdi': {'tasks': [{'title': 'Synthetic task', 'status': 'Done'}]}}
    assert client.put('/api/store', json=data).status_code == 200
    saved = client.get('/api/store').json()
    assert saved['settings'] == data['settings']
    assert all(saved['clients'][0][key] == value for key, value in original.items())
    assert saved['clients'][0]['measurementVisits'] == data['clients'][0]['measurementVisits']
    assert client.put('/api/store', json=data).status_code == 409
