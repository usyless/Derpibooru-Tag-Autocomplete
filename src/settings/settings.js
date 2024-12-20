if (typeof browser === 'undefined') {
    var browser = chrome;
}

const DIV = document.getElementById('settings');

const options = {
    'Preferences': [
        {
            name: 'match_start',
            description: "Match the start of the tags, rather than any match within the name of the tag",
            default: false
        },
        {
            name: 'special_searches',
            description: 'Include special search tags such as score:, created_at:, etc',
            default: true
        },
        {
            name: 'results_visible',
            description: 'Visible results count',
            type: 'number',
            default: 6,
            validate: (v) => Number(v) >= 1
        }
    ],
    'Local Autocomplete (Firefox Only)': [
        {
            name: 'local_autocomplete_enabled',
            description: 'Enable local autocomplete',
            default: false
        },
        {
            name: 'local_autocomplete_tags',
            description: '',
            type: 'button',
            button: 'Pick file for local autocomplete (must be a csv, formatted as {tag name},{tag count},"{tag aliases separated by commas inside quotes}")',
            onclick: () => {
                document.getElementById('local_autocomplete_tags_input').click();
            },
            init: () => {
                const i = document.createElement('input');
                i.type = 'file';
                i.id = 'local_autocomplete_tags_input';
                i.hidden = true;
                i.accept = '.csv';
                i.addEventListener('change', (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        let reader = new FileReader();
                        reader.addEventListener('load', async () => {
                            const data = {};
                            data['local_autocomplete_tags'] = reader.result;
                            data['local_autocomplete_current_file_name'] = file.name;
                            try {
                                await setStorage(data);
                                alert('Tags saved');
                            } catch {
                                alert('File size too big');
                            }
                            document.getElementById('local_autocomplete_current_file_name').textContent = file.name;
                        })
                        reader.readAsText(file);
                });
                document.body.appendChild(i);
            }
        },
        {
            name: 'local_autocomplete_current_file_name',
            description: 'Currently loaded tags file name: ',
            type: 'info',
            default: 'No file currently loaded'
        }
    ],
    'Extras': [
        {
            name: 'reset_all_settings',
            description: '',
            type: 'button',
            button: 'Reset to DEFAULT settings',
            class: ['warning'],
            onclick: () => {
                if (confirm('Are you sure you want to RESET this extensions settings?')) {
                    clearStorage();
                    window.location.reload();
                }
            }
        }
    ]
}
const typeMap = {
    button: create_button,
    info: create_info,
    number: create_number
}
let values;
for (const section in options) {
    const outer = document.createElement('div'), h = document.createElement('h3');
    h.textContent = section;
    outer.appendChild(h);
    for (const inner in options[section]) outer.appendChild(create(options[section][inner]));
    DIV.appendChild(outer);
}

function create(elem) {
    elem.init?.();
    return typeMap[elem.type]?.(elem) ?? create_checkbox(elem);
}

function create_checkbox(e) {
    const [outer, checkbox] = get_generic_setting(e, 'input', true);
    checkbox.setAttribute('type', 'checkbox');
    get_value(e.name, e.default).then(v => checkbox.checked = v);
    checkbox.addEventListener('change', toggle_value)
    return outer;
}

function create_button(e) {
    const [outer, button] = get_generic_setting(e, 'button');
    button.textContent = e.button;
    button.addEventListener('click', e.onclick);
    return outer;
}

function create_info(e) {
    const [outer, info] = get_generic_setting(e, 'span');
    get_value(e.name, e.default).then(v => info.textContent = v);
    return outer;
}

function create_number(e) {
    const [outer, input] = get_generic_setting(e, 'input');
    input.type = 'number';
    get_value(e.name, e.default).then(v => input.value = v);
    input.addEventListener('input', () => {
        if (e.validate(input.value)) setStorage({[e.name]: Number(input.value)});
        else input.value = e.default;
    });
    return outer;
}

function get_generic_setting(e, element, flipOrder) {
    const outer = document.createElement('div'), label = document.createElement('label'), elem = document.createElement(element);
    label.textContent = e.description;
    label.setAttribute('for', e.name);
    elem.id = e.name;
    if (e.class) elem.classList.add(...e.class);
    if (flipOrder) outer.append(elem, label);
    else outer.append(label, elem);
    return [outer, elem];
}

async function get_value(value, def, refresh=false) {
    if (!values || refresh) values = await browser.storage.local.get();
    return values[value] ?? def;
}

function toggle_value(e) {
    const data = {};
    data[e.target.id] = e.target.checked;
    setStorage(data);
}

async function setStorage(data) {
    await chrome.storage.local.set(data);
}

function clearStorage() {
    chrome.storage.local.clear();
}