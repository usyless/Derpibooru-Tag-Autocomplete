const requestMap = {
    local_autocomplete_set: local_autocomplete_set,
    local_autocomplete_complete: local_autocomplete_complete,
    local_autocomplete_load: local_autocomplete_load,
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

let local_autocomplete_worker;
let setting_up_worker = false;
function local_autocomplete_load(request, sendResponse) {
    if (local_autocomplete_worker != null) sendResponse(true);
    else if (!setting_up_worker) {
        setting_up_worker = true;
        local_autocomplete_worker = new Worker("/worker.js");
        local_autocomplete_get().then((r) => {
            local_autocomplete_worker.postMessage({type: 'data', data: r});
            sendResponse(true);
        });
    } else {
        sendResponse(false);
    }
}

function local_autocomplete_complete(request, sendResponse) {
    console.log("hi", request, local_autocomplete_worker);
    local_autocomplete_worker.onmessage = (r) => {
        sendResponse(r.data);
    };
    request.type = 'query';
    local_autocomplete_worker.postMessage(request);
}