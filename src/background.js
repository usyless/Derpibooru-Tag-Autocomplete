const requestMap = {
    local_autocomplete_set: local_autocomplete_set,
    local_autocomplete_complete: null,
    local_autocomplete_load: null,
    clear_all_autocomplete: clear_all_autocomplete,
}

let AUTOCOMPLETE_LOADED = false;
let SETTING_UP_AUTOCOMPLETE = false;
let AUTOCOMPLETE_ERROR = null;

const reload_autocomplete = () => {
    AUTOCOMPLETE_LOADED = false;
    SETTING_UP_AUTOCOMPLETE = false;
    AUTOCOMPLETE_ERROR = null;
}

chrome.runtime.onMessage.addListener((request, _, sendResponse) => {
    requestMap[request.type]?.(request, sendResponse);
    return true;
});

chrome?.runtime?.onInstalled?.addListener?.((details) => {
    updateLocalAutocompleteDB().then(() => {
        if (details.reason === 'install') chrome.tabs.create({url: chrome.runtime.getURL('/settings/settings.html?installed=true')});
        else if (details.reason === 'update' && details.previousVersion != null) migrateSettings(details.previousVersion);
    });
});

// migrating to new settings format
function versionBelowGiven(previousVersion, maxVersion) {
    previousVersion = (previousVersion?.match?.(/\d+/g) ?? []).join('');
    maxVersion = (maxVersion?.match?.(/\d+/g) ?? []).join('');
    const length = Math.max(previousVersion.length, maxVersion.length);
    return Number(previousVersion.padEnd(length, '0')) < Number(maxVersion.padEnd(length, '0'));
}

async function migrateSettings(previousVersion) {
    // 1.2.6 is settings migrate update
    if (versionBelowGiven(previousVersion, '1.2.6')) {
        console.log("Migrating settings to new format");
        chrome.storage.local.get(async (s) => {
            const {
                match_start, special_searches, results_visible,

                local_autocomplete_enabled, local_autocomplete_tags, local_autocomplete_current_file_name
            } = s;

            await chrome.storage.local.clear();
            const newSettings = {preferences: {}, local_autocomplete_current_file_name};

            if (match_start != null) newSettings.preferences.match_start = match_start;
            if (special_searches != null) newSettings.preferences.special_searches = special_searches;
            if (results_visible != null) newSettings.preferences.results_visible = results_visible;

            if (local_autocomplete_enabled != null) newSettings.preferences.local_autocomplete_enabled = local_autocomplete_enabled;

            await chrome.storage.local.set(newSettings);

            await local_autocomplete_set({data: local_autocomplete_tags ?? ""});
        });
    }

    if (versionBelowGiven(previousVersion, '1.3')) {
        // force it to be parsed
        await local_autocomplete_set({data: await local_autocomplete_get()});
    }
}

function updateLocalAutocompleteDB() {
    return new Promise((resolve) => {
        const db = indexedDB.open('local_autocomplete', 2);
        db.addEventListener('upgradeneeded', (event) => {
            const db = event.target.result;

            if (event.oldVersion <= 0) {
                const objectStore = db.createObjectStore('data', {keyPath: 'id'});
                objectStore.put({id: "1", data: ""});
            }

            if (event.oldVersion <= 1) {
                const objectStore = event.target.transaction.objectStore('data');
                objectStore.put({id: "2", data: ""});
            }
        });
        db.addEventListener('success', resolve);
    });
}

let local_autocomplete_db;
let db_opening = false;
const pending_db_promises = [];
function getAutocompleteDB() {
    return new Promise((resolve) => {
        if (local_autocomplete_db != null) resolve(local_autocomplete_db);
        else if (db_opening) pending_db_promises.push(resolve);
        else {
            db_opening = true;
            indexedDB.open('local_autocomplete', 2)
                .addEventListener('success', (e) => {
                    local_autocomplete_db = e.target.result;
                    db_opening = false;
                    resolve(local_autocomplete_db);

                    for (const promise of pending_db_promises) promise(local_autocomplete_db);
                    pending_db_promises.length = 0;
                });
        }
    });
}

function local_autocomplete_set(request, sendResponse) {
    getAutocompleteDB().then((db) => {
        db.transaction(['data'], 'readwrite').objectStore('data')
            .put({id: "1", data: parseCSV(request.data)}).addEventListener('success', () => {
                sendResponse?.(true);
                // force a reload
                reload_autocomplete();
        });
    });
}

function parseCSV(csv) {
    const tags = [];
    try {
        const push = tags.push.bind(tags), lines = csv.split('\n'), ll = lines.length;
        for (let i = 0; i < ll; ++i) {
            const values = lines[i].split(',');

            if (values.length === 1 && values[0] === '') continue;
            else if (values.length >= 2) {
                const aliases = [];

                for (let i = 2; i < values.length; ++i) {
                    if (values[i] === "") break;
                    aliases.push(values[i].trim().toLowerCase().replaceAll('"', ""));
                }

                push([values[0].trim().toLowerCase(), aliases, values[1]]);
            } else {
                return `Error parsing tags CSV at line ${Number(i.toString()) + 1}`;
            }
        }
    } catch (e) {
        return `Error parsing tags CSV. Error message: ${e.message}`;
    }
    return tags.length > 0 ? tags : 'Make sure to provide a valid tags file.';
}

function local_autocomplete_get() {
    return new Promise((resolve) => {
        getAutocompleteDB().then((db) => {
            db.transaction(['data'], 'readonly').objectStore('data').get("1").addEventListener('success', (e) => {
                resolve(e.target.result.data);
            });
        });
    });
}

function clear_all_autocomplete(_, sendResponse) {
    getAutocompleteDB().then((db) => {
        const t = db.transaction(['data'], 'readwrite');
        const os = t.objectStore('data');
        os.put({id: "1", data: ""});
        os.put({id: "2", data: ""});
        t.addEventListener('complete', () => {
            sendResponse?.(true);
            reload_autocomplete();
        });
    });
}

function derpi_autocomplete_set(data) {
    getAutocompleteDB().then((db) => {
        db.transaction(['data'], 'readwrite').objectStore('data').put({id: "2", data});
    });
}

function derpi_autocomplete_get() {
    return new Promise((resolve) => {
        getAutocompleteDB().then((db) => {
            db.transaction(['data'], 'readonly').objectStore('data').get("2").addEventListener('success', (e) => {
                resolve(e.target.result.data);
            });
        });
    });
}

const DERPI_COMPILED_VERSION = 2;
async function getDerpiCompiledTags() {
    const now = new Date(),
        r = await fetch(`https://derpibooru.org/autocomplete/compiled?vsn=${DERPI_COMPILED_VERSION}&key=${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`),
        modified = new Date(r.headers.get('last-modified')),
        curr = await derpi_autocomplete_get();

    if (!r.ok) return [];

    modified.setHours(0, 0, 0, 0);
    now.setHours(0, 0, 0, 0);
    if ((modified.toISOString() === now.toISOString()) && Array.isArray(curr)) {
        console.log("Reusing saved db");
        return curr;
    } else {
        console.log("Loading new db");
        const b = await r.arrayBuffer(), view = new DataView(b), tags = [],
            num_tags = view.getUint32(b.byteLength - 4, true),
            textDecoder = new TextDecoder('utf-8');
        if (view.getUint32(b.byteLength - 12, true) !== DERPI_COMPILED_VERSION) return [];
        let ptr = 0;
        // get all tag and alias names
        for (let i = 0; i < num_tags; ++i) {
            const tag_length = view.getUint8(ptr++);
            tags.push([textDecoder.decode(new Uint8Array(b, ptr, tag_length)), [], 0]);
            ptr += tag_length;
            ptr += 1 + (view.getUint8(ptr) * 4);
        }

        // tag references
        ptr = view.getUint32(b.byteLength - 8, true);
        let aliases_count = 0;
        for (let i = 0; i < num_tags; ++i) {
            ptr += 4;
            const count = view.getInt32(ptr, true);
            tags[i][2] = count;
            ptr += 4;
            if (count < 0) {
                tags[-count - 1][1].push(tags[i][0]);
                ++aliases_count;
            }
        }

        tags.sort((a, b) => b[2] - a[2]);
        // cut off aliases
        tags.length = num_tags - aliases_count;
        derpi_autocomplete_set(tags);
        return tags;
    }
}

{
    let tags, pos = -1, length, comparator, query_length, local = false;

    requestMap['local_autocomplete_load'] = (request, sendResponse) => {
        if (request.local !== local) reload_autocomplete();
        if (AUTOCOMPLETE_LOADED) sendResponse(true);
        else if (!SETTING_UP_AUTOCOMPLETE) {
            SETTING_UP_AUTOCOMPLETE = true;
            local = request.local;
            (local ? local_autocomplete_get : getDerpiCompiledTags)().then((t) => {
                if (Array.isArray(t)) {
                    tags = t;
                    length = tags.length;
                }
                else AUTOCOMPLETE_ERROR = t;
                sendResponse(true);
                AUTOCOMPLETE_LOADED = true;
            });
        } else {
            sendResponse(false);
        }
    };

    const escapeRegex = RegExp.escape || ((str) => str.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&'));
    const getRegex = (str, match_start) =>
        new RegExp((match_start ? '^' : '') + escapeRegex(str).replaceAll('\\*', '.*').replaceAll('\\?', '.'));

    requestMap['local_autocomplete_complete'] = (request, sendResponse) => {
        if (AUTOCOMPLETE_ERROR == null) {
            const result = [];
            if (request.newQuery) {
                pos = -1;
                comparator = RegExp.prototype.test.bind(getRegex(request.query, request.match_start));
                // remove * and ? from query length to ensure no missed results
                query_length = request.query.replaceAll('*', '').replaceAll('?', '').length;
            }
            for (++pos; pos < length; ++pos) {
                const [name, aliases, images] = tags[pos];
                if (query_length <= name.length && comparator(name)) {
                    result.push({aliased_tag: null, name, images});
                } else for (const a of aliases) if (query_length <= a.length && comparator(a)) {
                    result.push({aliased_tag: name, name: a, images});
                    break;
                }
                if (result.length >= 25) break;
            }
            sendResponse(result);
        } else {
            sendResponse({aliased_tag: null, name: AUTOCOMPLETE_ERROR, images: -2});
        }
    }
}