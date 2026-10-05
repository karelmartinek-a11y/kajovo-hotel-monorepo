import React from 'react';
import {DagmarConsole} from '@dagmar/browser';
import {request,memoryRequest} from './voice-request';
export function VoiceCorePage() {
  return <main className="k-page"><DagmarConsole request={request} memoryRequest={memoryRequest}/></main>;
}
