// Native adapter: the compiled view imports no state, compiler or run modules.
import { mountWorkbench } from '../../dist/lattice-ui.js?v=0.27.1';
export function createWorkbench(actions) {
    const view = mountWorkbench(document.body, { ...actions, logoUrl: new URL('../../assets/lattice-logo.svg', import.meta.url).href });
    view.root._parts = view.parts;
    return view;
}
