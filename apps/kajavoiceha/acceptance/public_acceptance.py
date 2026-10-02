#!/usr/bin/env python3
"""Run public ingress and MCP read acceptance; credentials stay on the caller."""
import argparse,base64,json,re,ssl,urllib.request,urllib.error,time,pathlib
PUBLIC='https://apimcpkajavoiceha.hcasc.cz'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k): return None
class Probe:
 def __init__(self,env):
  values=dict(line.split('=',1) for line in pathlib.Path(env).read_text().splitlines() if '=' in line and not line.startswith('#'))
  self.token=values['KAJAVOICEHA_MCP_TOKEN'].strip().strip('"').strip("'")
  assert values.get('KAJAVOICEHA_MCP_URL',PUBLIC+'/mcp').strip('"').strip("'")==PUBLIC+'/mcp'
  self.opener=urllib.request.build_opener(NoRedirect,urllib.request.HTTPSHandler(context=ssl.create_default_context()))
  self.count=0;self.protocol='2025-11-25';self.last=None
 def http(self,path='/mcp',payload=None,token=True,extra=None):
  headers={'Accept':'application/json, text/event-stream'}
  if payload is not None:headers['Content-Type']='application/json';headers['MCP-Protocol-Version']=self.protocol
  if token:headers['Authorization']='Bearer '+(self.token if token is True else token)
  if extra:headers.update(extra)
  req=urllib.request.Request(PUBLIC+path,data=json.dumps(payload).encode() if payload is not None else None,headers=headers)
  try:
   with self.opener.open(req,timeout=50) as res:return res.status,res.read(8*1024*1024)
  except urllib.error.HTTPError as e:return e.code,e.read(1024*1024)
 def rpc(self,method,params):
  self.count+=1
  code,body=self.http(payload={'jsonrpc':'2.0','id':self.count,'method':method,'params':params})
  assert code==200,(method,code)
  try:out=json.loads(body)
  except json.JSONDecodeError:
   out=json.loads(next(x[6:] for x in body.decode().splitlines() if x.startswith('data: ')))
  assert 'error' not in out,(method,'protocol_error')
  return out['result']
 def tool(self,args):
  result=self.rpc('tools/call',{'name':'smart_technologie','arguments':args})
  text=next(x['text'] for x in result['content'] if x['type']=='text'); table=json.loads(text)
  assert len(table['fields'])==8 and len(table['devices'])==199 and all(len(r)==8 for r in table['devices'])
  assert [f['key'] for f in table['fields']]==['name','location','kind','controls','readings','current_state','possible_states','availability']
  assert not re.search(r'home[ _-]*assistant|(?:light|switch|camera|sensor|select|binary_sensor|button|siren)\.[a-z0-9_]+|192\.168\.124\.|entity_id|device_id',text,re.I),'private_public_boundary'
  assert self.token not in text
  defs=table['fields'][3];read_defs=table['fields'][4];state_defs=table['fields'][6]
  for row in table['devices']:
   for values in row[3]:
    c=dict(zip(defs['item_fields'],values));assert c['component_ref'] in defs['component_names'] and c['action_ref'] in defs['action_names'] and c['parameters_ref'] in defs['parameter_definitions']
   readings={}
   for values in row[4]:
    c=dict(zip(read_defs['item_fields'],values));assert c['component_ref'] in defs['component_names'] and c['reading_ref'] in read_defs['reading_names'];readings[c['function']]=c
   assert all(values[0] in readings for values in row[5])
   for values in row[6]:
    c=dict(zip(state_defs['item_fields'],values));assert c['component_ref'] in defs['component_names'] and c['states_ref'] in state_defs['state_definitions']
  self.last=table;return result,table

def main():
 p=argparse.ArgumentParser();p.add_argument('--env',required=True);p.add_argument('--camera',action='store_true');p.add_argument('--private-catalog');a=p.parse_args();q=Probe(a.env)
 for token in [False,'invalid-acceptance-token']:
  code,_=q.http('/healthz',token=token);assert code==401,('auth',code)
  code,_=q.http(payload={'jsonrpc':'2.0','id':999,'method':'initialize','params':{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'auth-probe','version':'1'}}},token=token);assert code==401,('mcp_auth',code)
 code,body=q.http('/healthz');assert code==200 and json.loads(body)['status']=='ready'
 code,_=q.http('/healthz',extra={'Origin':'https://unrelated.invalid'});assert code==403
 hello=q.rpc('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'KajaVoiceHA-acceptance','version':'1'}})
 q.protocol=hello['protocolVersion'];assert hello['serverInfo']['name']=='KajaVoiceHA'
 code,_=q.http(payload={'jsonrpc':'2.0','method':'notifications/initialized','params':{}});assert code in [200,202,204],('initialized_notification',code)
 listed=q.rpc('tools/list',{});assert [x['name'] for x in listed['tools']]==['smart_technologie']
 assert not re.search(r'home[ _-]*assistant|entity_id|device_id',json.dumps(listed),re.I)
 _,table=q.tool({'operation':'catalog'});rev=table['catalog_revision'];names=[x[0] for x in table['devices']]
 if a.private_catalog:
  private=json.loads(pathlib.Path(a.private_catalog).read_text());assert names==[x['name'] for x in private['devices']];assert rev==private['revision']
 _,read=q.tool({'operation':'read','catalog_revision':rev,'rows':[1,199]});assert len(read['results'])==2
 bad,_=q.tool({'operation':'read','catalog_revision':rev,'rows':[200]});assert bad.get('isError')
 bad,_=q.tool({'operation':'read','catalog_revision':'obsolete','rows':[1]});assert bad.get('isError')
 image_report=None
 if a.camera:
  defs=table['fields'][3]
  action_names=defs.get('action_names',{})
  columns=defs['item_fields']
  def camera_function(f):
   entry=dict(zip(columns,f));label=action_names.get(entry.get('action_ref'),entry.get('label',''))
   return 'fotograf' in label.lower() and entry.get('supported',False)
  candidates=[i+1 for i,r in enumerate(table['devices']) if r[7]['available'] and any(camera_function(f) for f in r[3])]
  assert candidates,'no_available_camera'
  success=False
  for row in candidates[:2]:
   result,current=q.tool({'operation':'camera_view','catalog_revision':rev,'rows':[row]})
   images=[c for c in result['content'] if c['type']=='image']
   if not images:continue
   assert len(images)==1;data=base64.b64decode(images[0]['data'],validate=True)
   assert images[0]['mimeType'] in ['image/jpeg','image/png'] and len(data)>100
   assert current['image']['captured_at'] is None
   image_report={'row':row,'bytes':len(data),'mime':images[0]['mimeType']};del data;success=True;break
  assert success,'camera_snapshot_not_observed'
 print(json.dumps({'public_https':'pass','auth':'pass','protocol':q.protocol,'single_tool':'pass','catalog_rows':199,'catalog_fields':8,'revision':rev,'private_boundary':'pass','live_read':'pass','invalid_selection':'pass','image':image_report},ensure_ascii=False))
if __name__=='__main__':main()
