import React from 'react';
import {createRoot} from 'react-dom/client';
import {DagmarConsole, type DagmarRequest} from '@dagmar/browser';
const transport=(prefix:string):DagmarRequest=>async<T,>(path:string,method='GET',body?:unknown,signal?:AbortSignal,headers?:Record<string,string>)=>{
  const response=await fetch(prefix+path,{method,signal,cache:'no-store',headers:{'x-test-admin':'test-admin-a','x-test-csrf':'dagmar-test-only',...headers,...(body instanceof Blob?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:body instanceof Blob?body:JSON.stringify(body)});
  if(!response.ok)throw {category:response.status===401?'unauthorized':'request_failed'};
  return response.json() as Promise<T>;
};
document.cookie='dagmar_test_admin=test-admin-a; SameSite=Strict; Path=/';
const request=transport('/dagmar'),memoryRequest=transport('/dagmar-memory');
createRoot(document.getElementById('root')!).render(<DagmarConsole request={request} memoryRequest={memoryRequest} download={path=>{window.location.href='/dagmar'+path;}}/>);
