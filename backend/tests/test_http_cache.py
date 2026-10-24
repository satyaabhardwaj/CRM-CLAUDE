from backend.tests.test_api import api, sign_in


def test_only_hashed_assets_are_immutable(api, tmp_path, monkeypatch):
    import backend.app as module
    client, _, _ = api
    folder = tmp_path / 'backend/web/assets'
    folder.mkdir(parents=True)
    for name in ('entry-AbCd1234.js', 'login.js'):
        (folder / name).write_text('export const test = 1;\n' * 100)
    monkeypatch.setattr(module, 'ROOT', tmp_path)
    hashed = client.get('/auth-assets/entry-AbCd1234.js', headers={'Accept-Encoding': 'gzip'})
    assert hashed.headers['cache-control'] == 'public, max-age=31536000, immutable'
    assert hashed.headers['content-encoding'] == 'gzip'
    assert client.get('/auth-assets/login.js').headers['cache-control'] == 'no-store'
    assert client.get('/auth-assets/missing-AbCd1234.js').headers['cache-control'] == 'no-store'
    sign_in(client)
    assert client.get('/api/store').headers['cache-control'] == 'no-store'
