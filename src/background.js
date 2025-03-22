const requestMap = {
    local_autocomplete_set: local_autocomplete_set,
    local_autocomplete_complete: null,
    local_autocomplete_load: null,
}

let AUTOCOMPLETE_LOADED = false;
let SETTING_UP_AUTOCOMPLETE = false;
let AUTOCOMPLETE_ERROR = null;

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

function migrateSettings(previousVersion) {
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
}

function updateLocalAutocompleteDB() {
    return new Promise((resolve) => {
        const db = indexedDB.open('local_autocomplete', 1);
        db.addEventListener('upgradeneeded', (event) => {
            const db = event.target.result;

            if (event.oldVersion <= 0) {
                const objectStore = db.createObjectStore('data', {keyPath: 'id'});
                objectStore.put({id: "1", data: ""});
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
            indexedDB.open('local_autocomplete', 1)
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
            .put({id: "1", data: request.data}).addEventListener('success', () => {
                sendResponse?.(true);
                // force a reload
                AUTOCOMPLETE_LOADED = false;
                SETTING_UP_AUTOCOMPLETE = false;
                AUTOCOMPLETE_ERROR = null;
        });
    });
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

{
    let tags = [], pos = -1, length;

    requestMap['local_autocomplete_load'] = (request, sendResponse) => {
        if (AUTOCOMPLETE_LOADED) sendResponse(true);
        else if (!SETTING_UP_AUTOCOMPLETE) {
            SETTING_UP_AUTOCOMPLETE = true;
            getTags().then((t) => {
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
            // remove * and ? from query length to ensure no missed results
            const query_length = request.query.replaceAll('*', '').replaceAll('?', '').length,
                result = [], regex = getRegex(request.query, request.match_start),
                comparator = regex.test.bind(regex);
            if (request.newQuery) pos = -1;
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

    async function getTags() {
        const tags = [];
        try {
            const push = tags.push.bind(tags), lines = (await local_autocomplete_get()).split('\n'), ll = lines.length;
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
        return tags;
    }
}