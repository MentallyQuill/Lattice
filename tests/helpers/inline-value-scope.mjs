// A field tree keeps parents and siblings mounted. Test editors in the expanded
// field's group instead of assuming navigation replaced the entire DOM.
const active = new WeakMap();
export function findInlineEditor(host, label) {
    const id=active.get(host);
    const scope=id?[...host.querySelectorAll('[data-value-node]')].find(node=>node.id===id):null;
    const find=root=>[...root.querySelectorAll('[aria-label]')].find(element=>element.getAttribute('aria-label')===label);
    return scope && find(scope) || find(host);
}
export function rememberValueEditor(host, button, flush) {
    if(!button.classList.contains('value-toggle'))return;
    // Older editor tests use this action to select a field; a newly added row
    // may already be open, so ensure it is expanded before editing its group.
    if(button.getAttribute('aria-expanded')!=='true'){button.click();flush();}
    active.set(host,button.getAttribute('aria-controls'));
}
export function selectValueScope(host, path) {
    const scope=[...host.querySelectorAll('[data-value-path]')].find(node=>node.getAttribute('data-value-path')===JSON.stringify(path));
    if(!scope)throw Error('Missing inline value scope '+JSON.stringify(path));
    active.set(host,scope.id);return scope;
}
