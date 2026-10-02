#!/usr/bin/env python3
"""Read a sanitized live state snapshot through the existing production SSH alias."""
import argparse
import json
import os
import pathlib
import subprocess

REMOTE = r'''
import datetime,json,re,urllib.request
with open('/etc/hotel-smart-technologies/ha-token') as file:
    credential=file.read().strip()
request=urllib.request.Request('http://192.168.124.10:80/api/states',headers={'Authorization':'Bearer '+credential})
with urllib.request.urlopen(request,timeout=20) as response:
    states=json.load(response)
secret=re.compile(r'token|password|secret|api_key|authorization|credential',re.I)
def clean(value):
    if isinstance(value,dict):
        return {key:clean(item) for key,item in value.items() if not secret.search(key) and key!='entity_picture'}
    if isinstance(value,list):return [clean(item) for item in value]
    if isinstance(value,str) and re.search(r'https?://',value,re.I):return '[soukromy odkaz odstranen]'
    return value
print(json.dumps({'generated_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'states':clean(states)},ensure_ascii=False))
'''


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--out',required=True,type=pathlib.Path)
    args=parser.parse_args()
    result=subprocess.run(['ssh','-o','BatchMode=yes','-o','ConnectTimeout=10','produkce','python3','-c',"'"+REMOTE.replace("'","'\\''")+"'"],capture_output=True,check=True)
    payload=json.loads(result.stdout)
    args.out.parent.mkdir(parents=True,exist_ok=True)
    descriptor=os.open(args.out,os.O_CREAT|os.O_TRUNC|os.O_WRONLY,0o600)
    os.fchmod(descriptor,0o600)
    with os.fdopen(descriptor,'w') as file:
        json.dump(payload,file,ensure_ascii=False)
        file.write('\n')
    print(json.dumps({'states':len(payload['states']),'generated_at':payload['generated_at']}))


if __name__=='__main__':main()
