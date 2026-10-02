#!/usr/bin/env python3
"""Owner-approved reversible brightness/color test for exactly 0P0BSvetlo."""
import argparse,json,os,pathlib,time,uuid,urllib.request
from public_acceptance import Probe

def main():
 p=argparse.ArgumentParser();p.add_argument('--env',required=True);p.add_argument('--private-catalog',required=True);p.add_argument('--restore-file',required=True);a=p.parse_args()
 q=Probe(a.env);private=json.loads(pathlib.Path(a.private_catalog).read_text());device=next(d for d in private['devices'] if d['name']=='0P0BSvetlo')
 on=next(f for f in device['controls'] if f['domain']=='light' and f['service']=='turn_on');off=next(f for f in device['controls'] if f['domain']=='light' and f['service']=='turn_off' and f['entity_id']==on['entity_id'])
 secret=pathlib.Path('/etc/hotel-smart-technologies/ha-token').read_text().strip();eid=on['entity_id'];base='http://192.168.124.10'
 def backend(path,data=None):
  req=urllib.request.Request(base+path,data=json.dumps(data).encode() if data is not None else None,headers={'Authorization':'Bearer '+secret,'Content-Type':'application/json'})
  with urllib.request.urlopen(req,timeout=15) as r:return json.load(r)
 def state():return backend('/api/states/'+eid)
 def wait(predicate):
  end=time.monotonic()+12
  while time.monotonic()<end:
   s=state()
   if predicate(s):return s
   time.sleep(.3)
  raise RuntimeError('expected_reported_state_not_observed')
 prefix='accept-'+uuid.uuid4().hex[:20]
 _,catalog=q.tool({'operation':'catalog'});rev=catalog['catalog_revision'];assert rev==private['revision']
 def command(control,params,suffix):
  result,out=q.tool({'operation':'control','catalog_revision':rev,'request_id':prefix+'-'+suffix,'controls':[{'row':device['row'],'function':control['id'],'parameters':params}]})
  assert not result.get('isError')
  assert out['results'][0]['status'] in ['accepted','state_observed'],out['results'][0]['status']
 def params_from(attrs):
  raw={}
  if attrs.get('brightness') is not None:raw['brightness']=attrs['brightness']
  mode=attrs.get('color_mode')
  if mode=='color_temp' and attrs.get('color_temp_kelvin') is not None:raw['color_temp_kelvin']=attrs['color_temp_kelvin']
  elif mode in ['hs','xy','rgb','rgbw','rgbww']:
   key={'hs':'hs_color','xy':'xy_color','rgb':'rgb_color','rgbw':'rgbw_color','rgbww':'rgbww_color'}[mode]
   if attrs.get(key) is not None:raw[key]=attrs[key]
  assert len(raw)>=2,'complete_color_baseline_unavailable'
  reverse={v:k for k,v in on['parameter_map'].items()}
  assert all(k in reverse for k in raw),'baseline_not_representable'
  return {reverse[k]:v for k,v in raw.items()},raw
 original=state();assert original['state'] in ['on','off']
 recovery={'original':original,'baseline':None,'restored':False}
 path=pathlib.Path(a.restore_file);path.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
 def save():
  fd=os.open(path,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600);os.fchmod(fd,0o600)
  with os.fdopen(fd,'w') as f:json.dump(recovery,f);f.flush();os.fsync(f.fileno())
 save();baseline=None;restore_params={};restore_raw={};tested=False;settings_restored=False
 def matches_restore(s):
  if s['state']!='on':return False
  for k,v in restore_raw.items():
   actual=s['attributes'].get(k)
   if isinstance(v,list):
    if not isinstance(actual,list) or len(v)!=len(actual) or any(abs(x-y)>2 for x,y in zip(v,actual)):return False
   elif actual is None or abs(actual-v)>3:return False
  return True
 try:
  if original['state']=='off':command(on,{},'baseline-on')
  def complete_baseline(s):
   if s['state']!='on' or s['attributes'].get('brightness') is None:return False
   attrs=s['attributes'];key={'color_temp':'color_temp_kelvin','hs':'hs_color','xy':'xy_color','rgb':'rgb_color','rgbw':'rgbw_color','rgbww':'rgbww_color'}.get(attrs.get('color_mode'))
   return bool(key and attrs.get(key) is not None)
  baseline=wait(complete_baseline)
  restore_params,restore_raw=params_from(baseline['attributes']);recovery['baseline']=baseline;save()
  assert 'rgb' in on['parameters']['properties'] and 'brightness_percent' in on['parameters']['properties']
  command(on,{'brightness_percent':65,'rgb':[0,0,255]},'blue65')
  seen=wait(lambda s:s['state']=='on' and abs(s['attributes'].get('brightness',-999)-round(.65*255))<=3 and (s['attributes'].get('hs_color') or [-1,-1])[0]>=230 and (s['attributes'].get('hs_color') or [-1,-1])[0]<=250)
  tested=True
 finally:
  try:
   if baseline is not None:
    try:command(on,restore_params,'restore-settings');wait(matches_restore)
    except Exception:backend('/api/services/light/turn_on',{'entity_id':[eid],**restore_raw});wait(matches_restore)
    settings_restored=True
  finally:
   if original['state']=='off':
    try:command(off,{},'restore-off');wait(lambda s:s['state']=='off')
    except Exception:backend('/api/services/light/turn_off',{'entity_id':[eid]});wait(lambda s:s['state']=='off')
  final=wait(lambda s:s['state']==original['state'])
  if original['state']=='on' and baseline is not None:
   assert abs(final['attributes'].get('brightness',-999)-baseline['attributes']['brightness'])<=3
  recovery['restored']=True;recovery['test_observed']=tested;save()
 assert tested and settings_restored
 print(json.dumps({'device':'0P0BSvetlo','brightness_color_reported':'pass','original_state':original['state'],'restored':'pass','remembered_settings_restored':'pass','evidence':'reported_backend_state; physical light not visually observed'}))
if __name__=='__main__':main()
