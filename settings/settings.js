if (typeof browser === "undefined") {
    var browser = chrome;
}

const DIV = document.getElementById("settings");

const options = {
    "Preferences": [
        {
            name: "match_start",
            description: "Match the start of the tags, rather than any match within the name of the tag",
            default: false
        },
    ],
    // Local autocomplete coming back eventually
    // "Local Autocomplete (Only for Firefox)": [
    //     {
    //         name: "local_autocomplete_enabled",
    //         description: "Enable local autocomplete rather than with the API (must provide a tag file below)",
    //         default: false
    //     },
    //     {
    //         name: "local_autocomplete_tags",
    //         description: "Choose the file for local autocomplete with the button",
    //         type: 'button',
    //         button: 'Pick File',
    //         onclick: () => {
    //
    //         },
    //         init: () => {
    //
    //         }
    //     },
    //     {
    //         name: "local_autocomplete_current_file_name",
    //         description: "Currently loaded tags file name: ",
    //         type: 'info',
    //         default: 'No file currently loaded',
    //         init: () => {
    //
    //         }
    //     }
    // ]
}
const typeMap = {
    button: create_button,
    info: create_info
}
let values;
for (const section in options) {
    const outer = document.createElement("div"), h = document.createElement("h2");
    h.innerText = section + ":";
    outer.appendChild(h);
    for (const inner in options[section]) outer.appendChild(create(options[section][inner]));
    DIV.appendChild(outer);
}

function create(elem) {
    elem.init?.();
    return typeMap[elem.type]?.(elem) ?? create_checkbox(elem);
}

function create_checkbox(e) {
    const [outer, checkbox] = get_generic_setting(e, "input");
    checkbox.setAttribute("type", "checkbox");
    get_value(e.name, e.default).then(v => checkbox.checked = v);
    checkbox.addEventListener('change', toggle_value)
    return outer;
}

function create_button(e) {
    const [outer, button] = get_generic_setting(e, "button");
    button.textContent = e.button;
    button.addEventListener('click', e.onclick);
    return outer;
}

function create_info(e) {
    const [outer, info] = get_generic_setting(e, "span");
    get_value(e.name, e.default).then(v => info.textContent = v);
    return outer;
}

function get_generic_setting(e, element) {
    const outer = document.createElement("div"), label = document.createElement("label"), elem = document.createElement(element);
    label.textContent = e.description;
    label.setAttribute("for", e.name);
    elem.id = e.name;
    outer.append(label, elem);
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

function update_value(e) {
    const data = {};
    data[e.target.id] = e.target.value;
    setStorage(data);
}

function setStorage(data) {
    chrome.storage.local.set(data);
}

function clearStorage() {
    chrome.storage.local.clear();
}