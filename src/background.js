const requestMap = {
    local_autocomplete_set: local_autocomplete_set,
    local_autocomplete_complete: null,
    local_autocomplete_load: null,
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
        indexedDB.open('local_autocomplete', 1)
            .addEventListener('upgradeneeded', (event) => {
                const db = event.target.result;

                if (event.oldVersion <= 0) {
                    const objectStore = db.createObjectStore('data', {keyPath: 'id'});
                    objectStore.put({id: "1", data: ""});
                }

                resolve(true);
            });
    });
}

let local_autocomplete_db;
let db_opening = false;
const pending_db_promises = [];
function getHistoryDB() {
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
    getHistoryDB().then((db) => {
        db.transaction(['data'], 'readwrite').objectStore('data')
            .put({id: "1", data: request.data}).addEventListener('success', () => {
                sendResponse?.(true);
        });
    });
}

function local_autocomplete_get() {
    return new Promise((resolve) => {
        getHistoryDB().then((db) => {
            db.transaction(['data'], 'readonly').objectStore('data').get("1").addEventListener('success', (e) => {
                resolve(e.target.result.data);
            });
        });
    });
}

{
    let tags = [], pos = -1, length, error = null;
    let setting_up_worker = false, loaded = false

    requestMap['local_autocomplete_load'] = (request, sendResponse) => {
        if (loaded) sendResponse(true);
        else if (!setting_up_worker) {
            setting_up_worker = true;
            local_autocomplete_get().then((r) => {
                parseCSV(r);
                length = tags.length;
                if (length === 0) error = 'No tags CSV loaded, go to settings and load one to use local autocomplete.';
                sendResponse(true);
                loaded = true;
            });
        } else {
            sendResponse(false);
        }
    };

    requestMap['local_autocomplete_complete'] = (request, sendResponse) => {
        if (error != null) {
            const comparator = request.match_start ? 'startsWith' : 'includes';
            const query = request.query, query_length = query.length, result = [];
            if (request.newQuery) pos = -1;
            for (++pos; pos < length; ++pos) {
                const tuple = tags[pos];
                if (query_length <= tuple[0].length && tuple[0][comparator](query)) {
                    result.push({aliased_tag: null, name: tuple[0], images: tuple[2]});
                } else for (const a of tuple[1]) if (query_length <= a.length && a[comparator](query)) {
                    result.push({aliased_tag: tuple[0], name: a, images: tuple[2]});
                    break;
                }
                if (result.length >= 25) break;
            }
            sendResponse(result);
        } else if (setting_up_worker) {
            // do nothing
        } else {
            sendResponse({aliased_tag: null, name: error, images: -2});
        }
    }

    class ParseError extends Error {
        constructor(message) {
            super(message);
            this.name = 'ParseError';
        }
    }

    function parseCSV(csvString) {
        try {
            tags = []
            const push = tags.push.bind(tags), lines = csvString.split('\n'), ll = lines.length;
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
                    throw new ParseError(i.toString());
                }
            }
        } catch (e) {
            error = (e instanceof ParseError) ? `Error parsing tags CSV at line ${Number(e.message) + 1}` :
                `Error parsing tags CSV. Error message: ${e.message}`;
        }
    }
}