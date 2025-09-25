let chromeMode = false;
// set browser to chrome if not in firefox
/** @type {typeof browser} */
const extension = typeof browser !== 'undefined' ? browser : (() => {
    chromeMode = true;
    return chrome;
})();

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

extension.runtime.onMessage.addListener((request, _, sendResponse) => {
    requestMap[request.type]?.(request, sendResponse);
    return true;
});

extension.runtime?.onInstalled?.addListener?.((details) => {
    updateLocalAutocompleteDB().then(() => {
        if (details.reason === 'install') void extension.tabs.create({url: extension.runtime.getURL('/settings/settings.html?installed=true')});
        else if (details.reason === 'update' && details.previousVersion != null) void migrateSettings(details.previousVersion);
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

        const {
            match_start, special_searches, results_visible,

            local_autocomplete_enabled, local_autocomplete_tags, local_autocomplete_current_file_name
        } = await extension.storage.local.get();

        await extension.storage.local.clear();
        const newSettings = {preferences: {}, local_autocomplete_current_file_name};

        if (match_start != null) newSettings.preferences.match_start = match_start;
        if (special_searches != null) newSettings.preferences.special_searches = special_searches;
        if (results_visible != null) newSettings.preferences.results_visible = results_visible;

        if (local_autocomplete_enabled != null) newSettings.preferences.local_autocomplete_enabled = local_autocomplete_enabled;

        await extension.storage.local.set(newSettings);

        await local_autocomplete_set({data: local_autocomplete_tags ?? ""});
    }

    if (versionBelowGiven(previousVersion, '1.3')) {
        // force it to be parsed
        await local_autocomplete_set({data: await local_autocomplete_get()});
    }
}

const LOCAL_AUTOCOMPLETE_DB_VERSION = 3;
function updateLocalAutocompleteDB() {
    return new Promise((resolve) => {
        const db = indexedDB.open('local_autocomplete', LOCAL_AUTOCOMPLETE_DB_VERSION);
        db.addEventListener('upgradeneeded', (event) => {
            const db = event.target.result;
            const transaction = event.target.transaction;

            if (event.oldVersion <= 0) {
                const objectStore = db.createObjectStore('data', {keyPath: 'id'});
                objectStore.put({id: "1", data: ""}); // fully local tags
            }

            if (event.oldVersion <= 1) {
                const objectStore = transaction.objectStore('data');
                objectStore.put({id: "2", data: ""}); // local derpi tags
            }

            if (event.oldVersion <= 2) {
                const objectStore = transaction.objectStore('data');
                objectStore.put({id: "3", data: ""}); // local derpi tags last date
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
            indexedDB.open('local_autocomplete', LOCAL_AUTOCOMPLETE_DB_VERSION)
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

function get_from_db(id) {
    return new Promise((resolve) => {
        getAutocompleteDB().then((db) => {
            db.transaction(['data'], 'readonly').objectStore('data').get(id).addEventListener('success', (e) => {
                resolve(e.target.result.data);
            });
        });
    });
}

function set_to_db(id, data) {
    return new Promise((resolve) => {
        getAutocompleteDB().then((db) => {
            db.transaction(['data'], 'readwrite').objectStore('data').put({id, data}).addEventListener('success', resolve);
        });
    });
}

function local_autocomplete_set(request, sendResponse) {
    set_to_db("1", parseCSV(request.data)).then(() => {
        sendResponse?.(true);
        reload_autocomplete();
    });
}

function local_autocomplete_get() {
    return get_from_db("1");
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

                push([values[0].trim().toLowerCase(), aliases.length > 0 ? aliases : undefined, +values[1]]);
            } else {
                return `Error parsing tags CSV at line ${Number(i.toString()) + 1}`;
            }
        }
    } catch (e) {
        return `Error parsing tags CSV. Error message: ${e.message}`;
    }
    return tags.length > 0 ? tags : 'Make sure to provide a valid tags file.';
}

function clear_all_autocomplete(_, sendResponse) {
    Promise.all([set_to_db("1", ""), set_to_db("2", "")]).then(() => {
        sendResponse?.(true);
        reload_autocomplete();
    });
}

const derpi_autocomplete_set = (data, key) => Promise.all([set_to_db("2", data), set_to_db("3",  key)]);
const derpi_autocomplete_get = () => Promise.all([get_from_db("2"), get_from_db("3")]);

const DERPI_COMPILED_VERSION = 2;
async function getDerpiCompiledTags() {
    try {
        const now = new Date(), key = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`;
        const [curr, last] = await derpi_autocomplete_get();

        if ((last === key) && Array.isArray(curr)) {
            console.log("Reusing saved db");
            return curr;
        } else {
            console.log("Loading new db");
            const r = await fetch(`https://derpibooru.org/autocomplete/compiled?vsn=${DERPI_COMPILED_VERSION}&key=${key}`);

            if (!r.ok) {
                console.error("Bad DB response: ", r.status);
                return [];
            }

            const b = await r.arrayBuffer(), view = new DataView(b),
                num_tags = view.getUint32(b.byteLength - 4, true),
                tags = Array.from({length: num_tags}, () => [undefined, undefined, 0]),
                textDecoder = new TextDecoder('utf-8');
            if (view.getUint32(b.byteLength - 12, true) !== DERPI_COMPILED_VERSION) return [];
            let ptr = 0, ptr_ref = view.getUint32(b.byteLength - 8, true), aliases_count = 0;
            // get all tag and alias names
            for (let i = 0; i < num_tags; ++i) {
                ptr_ref += 4;
                const tag_length = view.getUint8(ptr++),
                    count = view.getInt32(ptr_ref, true),
                    tag = tags[i];
                tag[0] = textDecoder.decode(new Uint8Array(b, ptr, tag_length));
                tag[2] = count;
                ptr_ref += 4;
                ptr += tag_length;
                ptr += 1 + (view.getUint8(ptr) * 4);

                if (count < 0) {
                    (tags[-count - 1][1] ??= []).push(tag[0]);
                    ++aliases_count;
                }
            }

            tags.sort((a, b) => b[2] - a[2]);
            // cut off aliases
            tags.length = num_tags - aliases_count;
            void derpi_autocomplete_set(tags, key);
            return tags;
        }
    } catch {
        return [];
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
                } else if (aliases) for (const a of aliases) if (query_length <= a.length && comparator(a)) {
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

// opening settings page
((chromeMode) ? extension.action : extension.browserAction)?.onClicked?.addListener(() => {
    void extension.runtime.openOptionsPage();
});