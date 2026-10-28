import { runTextRuleSegments } from './text-rules-engine.js?v=0.30.0';
self.addEventListener('message', event => self.postMessage(runTextRuleSegments(event.data)));
