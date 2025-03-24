'use strict';

if (typeof browser === 'undefined') {
    var browser = chrome;
}

(() => {
    document.getElementById('versionDisplay').textContent += chrome?.runtime?.getManifest?.()?.version;

    const DIV = document.getElementById('settings');

    const options = {
        'Preferences': [
            {
                name: 'match_start',
                description: "Match the start of the tags, rather than any match within the name of the tag",
                default: false,
                category: 'preferences'
            },
            {
                name: 'special_searches',
                description: 'Include special search tags such as score:, created_at:, etc',
                default: true,
                category: 'preferences'
            },
            {
                name: 'results_visible',
                description: 'Visible results count',
                type: 'number',
                default: 6,
                validate: (v) => Number(v) >= 1,
                category: 'preferences'
            },
            {
                name: 'api_fallback',
                description: "Fallback to using the Derpibooru API for results (Experimental)",
                default: true,
                category: 'preferences'
            }
        ],
        'Local Autocomplete': [
            {
                name: 'local_autocomplete_enabled',
                description: 'Enable local autocomplete from custom tags csv (fully disables api calls)',
                default: false,
                category: 'preferences'
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
                            const reader = new FileReader();
                            reader.addEventListener('load', async () => {
                                browser.runtime.sendMessage({type: 'local_autocomplete_set', data: reader.result}).then(() => {
                                    alert("Successfully saved tags!");
                                });
                                setStorage({'local_autocomplete_current_file_name': file.name});
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

    const valuesToUpdate = [];
    const typeMap = {
        text: (e) => {
            const [outer, input] = get_generic_setting(e, 'input');
            input.type = "text";
            valuesToUpdate.push({obj: e, func: (v) => input.value = v});
            input.addEventListener('change', (ev) => update_value(ev, e, 'value'));
            return outer;
        },
        button: (e) => {
            const [outer, button] = get_generic_setting(e, 'button');
            button.textContent = e.button;
            button.addEventListener('click', e.onclick);
            return outer;
        },
        checkbox: (e) => {
            const [outer, checkbox] = get_generic_setting(e, 'input', true);
            checkbox.setAttribute('type', 'checkbox');
            valuesToUpdate.push({obj: e, func: (v) => checkbox.checked = v});
            checkbox.addEventListener('change', (ev) => update_value(ev, e, 'checked'));
            return outer;
        },
        info: (e) => {
            const [outer, info] = get_generic_setting(e, 'span');
            valuesToUpdate.push({obj: e, func: (v) => info.textContent = v});
            return outer;
        },
        number: (e) => {
            const [outer, input] = get_generic_setting(e, 'input');
            input.type = 'number';
            valuesToUpdate.push({obj: e, func: (v) => input.value = v});
            input.addEventListener('input', (ev) => {
                if (e.validate(input.value)) update_value(ev, e, 'value');
                else input.value = e.default;
            });
            return outer;
        }
    }

    for (const section in options) {
        const outer = document.createElement('div'), h = document.createElement('h3');
        h.textContent = section;
        outer.appendChild(h);
        for (const inner in options[section]) outer.appendChild(create(options[section][inner]));
        DIV.appendChild(outer);
    }

    chrome.storage.local.get(valuesToUpdate.map(i => i.obj.category ?? i.obj.name), (s) => {
        for (const {obj, func} of valuesToUpdate) {
            if (obj.category != null) func(s[obj.category]?.[obj.name] ?? obj.default);
            else func(s[obj.name] ?? obj.default);
        }
        valuesToUpdate.length = 0;
    });

    function create(elem) {
        elem.init?.();
        return typeMap[elem.type ?? 'checkbox'](elem);
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

    function update_value(e, obj, property) {
        chrome.storage.local.get([obj.category ?? obj.name], (r) => {
            if (obj.category != null) {
                if (r[obj.category] == null) r[obj.category] = {};
                r[obj.category][obj.name] = e.target[property];
            } else {
                r[obj.name] = e.target[property];
            }
            setStorage(r);
        });
    }

    function setStorage(data) {
        chrome.storage.local.set(data); // potentially add little saved message with .then
    }

    function clearStorage() {
        chrome.storage.local.clear();
    }
})();