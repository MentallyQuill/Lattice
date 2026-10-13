import { runTextRuleSegments } from './text-rules-engine.js?v=0.27.3';
self.addEventListener('message', event => self.postMessage(runTextRuleSegments(event.data)));
