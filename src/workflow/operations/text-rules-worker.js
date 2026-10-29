import { runTextRuleSegments } from './text-rules-engine.js?v=0.30.2';
self.addEventListener('message', event => self.postMessage(runTextRuleSegments(event.data)));
