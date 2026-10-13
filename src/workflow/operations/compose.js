import { cloneJsonValue, readJsonPath, stringifyJsonValue } from './json-data.js?v=0.27.2';

const failure = (code, message) => ({ok:false,error:{code,message}});

function readComposeSettings(settings) {
  try {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return failure('INVALID_COMPOSE', 'Settings must be an object');
    if (Object.keys(settings).some(key => !['template','sections','data','separator'].includes(key))) return failure('INVALID_COMPOSE', 'Unsupported setting');
    const descriptors = Object.setPrototypeOf(Object.getOwnPropertyDescriptors(settings), null);
    if (Object.values(descriptors).some(property => !Object.hasOwn(property, 'value'))) return failure('INVALID_COMPOSE', 'Settings must use data properties');
    const template = descriptors.template?.value;
    const inputSections = descriptors.sections ? descriptors.sections.value : [];
    const data = descriptors.data?.value;
    const separator = descriptors.separator ? descriptors.separator.value : '\n\n';
    if ((template !== undefined && typeof template !== 'string') || typeof separator !== 'string' || !Array.isArray(inputSections)) return failure('INVALID_COMPOSE', 'Invalid template, separator or sections');
    if (inputSections.length > 64) return failure('INVALID_COMPOSE', 'At most 64 sections are supported');
    if ((template?.length ?? 0) > 100000 || separator.length > 100000) return failure('TEXT_LIMIT', 'Text exceeds 100,000 UTF-16 units');
    const names = new Set();
    const sections = [];
    for (let index = 0; index < inputSections.length; index++) {
      const element = Object.getOwnPropertyDescriptor(inputSections, String(index));
      if (!element || !Object.hasOwn(element, 'value')) return failure('INVALID_COMPOSE', 'Sections must be a dense data array');
      const raw = element.value;
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return failure('INVALID_COMPOSE', 'Section must be an object');
      const fields = Object.setPrototypeOf(Object.getOwnPropertyDescriptors(raw), null);
      if (Object.keys(fields).some(key => !['name','text'].includes(key)) || Object.values(fields).some(field => !Object.hasOwn(field,'value'))) return failure('INVALID_COMPOSE', 'Section must use name and text data properties');
      const section = {name:fields.name?.value,text:fields.text?.value};
      if (typeof section.name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]*$/u.test(section.name) || typeof section.text !== 'string') return failure('INVALID_COMPOSE', 'Sections require an identifier name and text');
      if (section.name.length > 100000 || section.text.length > 100000) return failure('TEXT_LIMIT', 'Section text exceeds 100,000 UTF-16 units');
      if (names.has(section.name)) return failure('INVALID_COMPOSE', 'Duplicate section: ' + section.name);
      names.add(section.name);
      sections.push(section);
    }
    return {ok:true,data:{template,sections,data,separator,descriptors}};
  } catch {
    return failure('INVALID_COMPOSE', 'Settings or sections could not be inspected');
  }
}

export function composeText(settings = {}) {
  const validated = readComposeSettings(settings);
  if (!validated.ok) return validated;
  const {template,sections,data,separator,descriptors} = validated.data;
  let cloned;
  if (Object.hasOwn(descriptors, 'data')) {
    const result = cloneJsonValue(data);
    if (!result.ok) return result;
    cloned = result.data.value;
  }
  let text = '';
  if (template === undefined) text = sections.map(section => section.text).join(separator);
  else {
    let position = 0;
    while (position < template.length) {
      const start = template.indexOf('{{', position);
      if (start < 0) { text += template.slice(position); break; }
      text += template.slice(position, start);
      if (template.startsWith('{{{{', start)) {
        text += '{{';
        position = start + 4;
        continue;
      }
      const end = template.indexOf('}}', start + 2);
      if (end < 0) return failure('INVALID_TEMPLATE', 'Unclosed placeholder');
      const token = template.slice(start + 2, end);
      if (token.startsWith('section:')) {
        const name = token.slice(8);
        const section = sections.find(section => section.name === name);
        if (!section) return failure('MISSING_SECTION', 'Missing section: ' + name);
        text += section.text;
      } else if (token.startsWith('data:')) {
        if (!Object.hasOwn(descriptors, 'data')) return failure('MISSING_PATH', 'Data was not provided');
        const pointer = token.slice(5);
        if ((pointer !== '' && !pointer.startsWith('/')) || /~(?![01])/u.test(pointer)) return failure('INVALID_TEMPLATE', 'Invalid JSON pointer');
        const path = pointer === '' ? [] : pointer.slice(1).split('/').map(part => part.replace(/~1/g, '/').replace(/~0/g, '~'));
        const result = readJsonPath(cloned, path);
        if (!result.ok) return result;
        if (!result.data.found) return failure('MISSING_PATH', 'Missing data path: ' + pointer);
        if (typeof result.data.value === 'string') text += result.data.value;
        else {
          const encoded = stringifyJsonValue(result.data.value);
          if (!encoded.ok) return encoded;
          text += encoded.data.text;
        }
      } else return failure('INVALID_TEMPLATE', 'Unsupported placeholder');
      if (text.length > 100000) return failure('TEXT_LIMIT', 'Output exceeds 100,000 UTF-16 units');
      position = end + 2;
    }
  }
  if (text.length > 100000) return failure('TEXT_LIMIT', 'Output exceeds 100,000 UTF-16 units');
  return {ok:true,data:{text,report:[]}};
}
