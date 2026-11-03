"""Paired Gemini experiment on synthetic VI/EN project briefs; never uses uploaded user data."""
import argparse
import asyncio
import csv
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import sys
import time
from types import SimpleNamespace
import httpx

ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
from app.core import settings
from app.services.gemini import answer_project, decompose

provider_metadata=[]
async def observe_response(response):
    await response.aread()
    try:
        body=response.json()
        from app.services.gemini import daily_quota_exhausted
        provider_metadata.append({'status':response.status_code,'model_version':body.get('modelVersion'),'usage':body.get('usageMetadata'),'daily_quota_exhausted':response.status_code==429 and daily_quota_exhausted(response)})
    except ValueError:
        provider_metadata.append({'status':response.status_code})


def score(case, response, has_documents):
    raw=response.model_dump(mode='json') if hasattr(response,'model_dump') else response
    text=json.dumps(raw,ensure_ascii=False).casefold() if isinstance(raw,dict) else raw.casefold()
    required=case.get('expected_any',[])
    covered=sum(any(word.casefold() in text for word in group) for group in required)
    forbidden=[word for word in case.get('forbidden',[]) if word.casefold() in text]
    result={'reference_keyword_coverage':covered/len(required) if required else None,'forbidden_terms':forbidden,'mentions_document':case['filename'].casefold() in text,'human_review_required':True}
    if case['mode']=='decompose':
        result['schema_valid']=True
        result['tasks_under_20_hours']=all(t['estimated_hours']<=20 for t in raw['tasks'])
    # Keyword matches only provide screening signals, not proof that claims are grounded.
    return result


async def experiment(args, cases):
    rows=[]
    for case in cases:
        for condition in ['without_documents','with_documents']:
            documents=[SimpleNamespace(filename=case['filename'],media_type='text/plain',extracted_text=case['document'])] if condition=='with_documents' else []
            for repetition in range(1,args.repeats+1):
                provider_metadata.clear()
                started=time.perf_counter()
                try:
                    response=await decompose(case['question'],'Synthetic task manager',documents,case['language']) if case['mode']=='decompose' else await answer_project('Synthetic task manager',documents,case['mode'],case['question'],case['language'])
                    raw=response.model_dump(mode='json') if hasattr(response,'model_dump') else response
                    row={'case_id':case['id'],'condition':condition,'repetition':repetition,'language':case['language'],'response':raw,'automatic_checks':score(case,response,bool(documents)),'status':'ok'}
                except Exception as error:
                    row={'case_id':case['id'],'condition':condition,'repetition':repetition,'status':'error','error_type':type(error).__name__,'http_status':getattr(error,'status_code',None)}
                row['latency_seconds']=round(time.perf_counter()-started,3);row['provider_responses']=list(provider_metadata);rows.append(row)
                print(json.dumps({'completed':len(rows),'case_id':case['id'],'condition':condition,'status':row['status']}),flush=True)
                if any(p.get('daily_quota_exhausted') for p in provider_metadata):return rows
    return rows


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--live',action='store_true');parser.add_argument('--self-test',action='store_true');parser.add_argument('--repeats',type=int,default=3);args=parser.parse_args()
    assert 1<=args.repeats<=5,'Use 1–5 repetitions'
    cases=json.loads((ROOT/'tests/fixtures/ai_cases.json').read_text(encoding='utf-8'))
    out=ROOT.parent/'docs/testing';out.mkdir(exist_ok=True)
    if args.self_test:
        c=cases[0];good='Authentication and Kanban; brief_en.txt';bad='Stripe blockchain'
        assert score(c,good,True)['reference_keyword_coverage']==1
        assert score(c,bad,True)['reference_keyword_coverage']==0
        assert score(c,bad,True)['forbidden_terms']
        print(json.dumps({'evaluator_self_test':'passed','live_model_evaluation':False}));return
    result={'date_utc':datetime.now(timezone.utc).isoformat(),'model':settings.gemini_model,'cases':len(cases),'languages':['vi','en'],'conditions':['without_documents','with_documents'],'planned_calls':len(cases)*2*args.repeats,'repeats':args.repeats,'human_rubric':['factual_grounding_0_to_2','no_unsupported_requirement_0_to_2','actionability_0_to_2','language_0_to_2','abstention_or_injection_resistance_0_to_2']}
    if not args.live or not settings.gemini_api_key:
        result.update(status='not_executed',reason='explicit --live and a replacement GEMINI_API_KEY are required',rows=[],quality_score=None)
    else:
        original=httpx.AsyncClient
        httpx.AsyncClient=lambda **kwargs:original(**kwargs,event_hooks={'response':[observe_response]})
        rows=asyncio.run(experiment(args,cases));latencies=[r['latency_seconds'] for r in rows if r['status']=='ok']
        result.update(status='quota_exhausted' if len(rows)<result['planned_calls'] else 'executed',rows=rows,attempted_calls=len(rows),not_executed_calls=result['planned_calls']-len(rows),successful_calls=len(latencies),latency_median_seconds=statistics.median(latencies) if latencies else None,quality_score=None)
        result['actual_model_versions']=sorted({p['model_version'] for r in rows for p in r['provider_responses'] if p.get('model_version')})
        result['condition_summary']={}
        for condition in result['conditions']:
            selected=[r for r in rows if r['condition']==condition];ok=[r for r in selected if r['status']=='ok']
            coverage=[r['automatic_checks']['reference_keyword_coverage'] for r in ok if r['automatic_checks']['reference_keyword_coverage'] is not None]
            result['condition_summary'][condition]={'planned':len(cases)*args.repeats,'attempted':len(selected),'not_executed':len(cases)*args.repeats-len(selected),'successful':len(ok),'failed':len(selected)-len(ok),'keyword_coverage_mean':statistics.mean(coverage) if coverage else None,'flagged_responses':sum(bool(r['automatic_checks']['forbidden_terms']) for r in ok),'latency_median_seconds':statistics.median(r['latency_seconds'] for r in ok) if ok else None}
        with (out/'ai-human-review.csv').open('w',newline='',encoding='utf-8-sig') as f:
            columns=['case_id','condition','repetition','reviewer',*result['human_rubric'],'notes'];writer=csv.DictWriter(f,fieldnames=columns);writer.writeheader()
            for r in rows:writer.writerow({k:r[k] for k in columns[:3]})
    (out/'ai-evaluation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='rows'},ensure_ascii=True))


if __name__=='__main__':main()
