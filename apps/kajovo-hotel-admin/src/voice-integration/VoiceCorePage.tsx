import React from 'react';
import {DagmarConsole} from '@dagmar/browser';
import '@dagmar/browser/styles.css';
import {request,memoryRequest} from './voice-request';
export function VoiceCorePage() {
  return <main className="k-page"><DagmarConsole request={request} memoryRequest={memoryRequest} download={path=>{window.location.href='/api/v1/admin/voice-core'+path;}}/></main>;
}
