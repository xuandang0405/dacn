import asyncio
import httpx
import pytest
from fastapi import HTTPException
from test_core import client
from test_review_fixes import team
from app.services import gemini


@pytest.mark.parametrize("upstream,expected,attempts", [(400,502,1),(401,503,1),(403,503,1),(404,503,1),(429,503,3),(500,503,3),(503,503,3)])
def test_provider_errors_are_bounded_and_never_expose_key(monkeypatch, upstream, expected, attempts):
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "fixture-key-only")
    calls=[];original=httpx.AsyncClient
    def reply(request):
        calls.append(request)
        return httpx.Response(upstream, json={"error": "fixture-key-only should not be reflected"})
    monkeypatch.setattr(gemini.httpx, "AsyncClient", lambda **kwargs: original(transport=httpx.MockTransport(reply)))
    async def no_wait(*args):pass
    monkeypatch.setattr(gemini.asyncio, "sleep", no_wait)
    with pytest.raises(HTTPException) as exc:asyncio.run(gemini.generate([{"text":"Test"}]))
    assert exc.value.status_code==expected and len(calls)==attempts
    assert "fixture-key-only" not in str(exc.value.detail)


@pytest.mark.parametrize("body", [{}, {"candidates": []}, {"candidates": [{"content": {"parts": []}}]}])
def test_invalid_provider_response_returns_502(monkeypatch, body):
    monkeypatch.setattr(gemini.settings, "gemini_api_key", "fixture-key-only")
    original=httpx.AsyncClient
    monkeypatch.setattr(gemini.httpx,"AsyncClient",lambda **kwargs:original(transport=httpx.MockTransport(lambda request:httpx.Response(200,json=body))))
    with pytest.raises(HTTPException) as exc:asyncio.run(gemini.generate([{"text":"Test"}]))
    assert exc.value.status_code==502


def test_daily_quota_exhaustion_is_not_retried(monkeypatch):
    monkeypatch.setattr(gemini.settings,"gemini_api_key","fixture-key-only")
    original=httpx.AsyncClient;calls=[]
    def reply(request):
        calls.append(request)
        return httpx.Response(429,json={"error":{"details":[{"violations":[{"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier","quotaValue":"20"}]}]}})
    monkeypatch.setattr(gemini.httpx,"AsyncClient",lambda **kwargs:original(transport=httpx.MockTransport(reply)))
    with pytest.raises(HTTPException) as exc:asyncio.run(gemini.generate([{"text":"Test"}]))
    assert exc.value.status_code==503 and 'daily quota' in exc.value.detail and len(calls)==1


@pytest.mark.parametrize("name,content,status", [("empty.txt",b"",422),("bad.docx",b"not-a-zip",422),("bad.pdf",b"%PDF-corrupt",422),("bad.txt",b"\xff",422),("file.exe",b"binary",415),("long.txt",b"x"*100001,413)], ids=["empty","corrupt-docx","corrupt-pdf","invalid-utf8","unsupported-extension","oversized-text"])
def test_document_errors_leave_no_metadata_or_storage(client, name, content, status):
    from app.services.storage import root
    headers, _, project, _=team(client);url=f"/api/v1/ai/projects/{project['id']}/documents"
    assert client.post(url,files={"file":(name,content)},headers=headers).status_code==status
    assert client.get(url,headers=headers).json()==[] and list(root().iterdir())==[]


def test_missing_document_storage_returns_503(client):
    from app.services.storage import root
    headers, _, project, _=team(client);url=f"/api/v1/ai/projects/{project['id']}"
    from pypdf import PdfWriter
    from io import BytesIO
    writer=PdfWriter();writer.add_blank_page(width=100,height=100);output=BytesIO();writer.write(output)
    assert client.post(url+'/documents',files={"file":('brief.pdf',output.getvalue())},headers=headers).status_code==201
    next(root().iterdir()).unlink()
    assert client.post(url+'/query',json={"mode":"analyze"},headers=headers).status_code==503
