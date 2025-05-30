'use strict';

(async () => {
    const scrollEvent = new Event('scroll'), API_TIMEOUT = 200;
    let fetchfunc, cleanQuery, apifetchfunc;

    // 0 -> text
    // 1 -> range
    const special_searches = [
        ["animated", 0], ["aspect_ratio", 1], ["comment_count", 1], ["created_at", 1], ["description", 0],
        ["downvotes", 1], ["duration", 1], ["faved_by", 0], ["faves", 1], ["file_name", 0], ["first_seen_at", 1],
        ["gallery_id", 0], ["height", 1], ["id", 1], ["mime_type", 0], ["orig_sha512_hash", 0], ["original_format", 0],
        ["pixels", 1], ["score", 1], ["sha512_hash", 0], ["size", 1], ["source_count", 1], ["source_url", 0],
        ["tag_count", 1], ["updated_at", 1], ["uploader", 0], ["upvotes", 1], ["width", 1], ["wilson_score", 1]
    ], range_modifiers = [
        ".gt", ".lt", ".gte", ".lte"
    ];

    const escapeRegex = RegExp.escape || ((str) => str.replace(/[.*+?^=!:${}()|\[\]\/\\]/g, '\\$&'));
    const getRegex = (str, match_start) =>
        new RegExp((match_start ? '^' : '') + escapeRegex(str).replaceAll('\\*', '.*').replaceAll('\\?', '.'));

    const Settings = { // Setting handling
        preferences: {
            match_start: false,
            special_searches: true,
            results_visible: 6,
            local_autocomplete_enabled: false,
            api_fallback: true,
        },

        loadSettings: () => new Promise(resolve => {
            chrome.storage.local.get(['preferences'], (s) => {
                for (const setting of ['preferences']) Settings[setting] = {...Settings[setting], ...s[setting]};
                resolve();
            });
        }),
    }

    const autocomplete = (input, ac_list) => {
        let receivedPage = true, localOver = false, currentQuery, controller = new AbortController(),
            lastApiCall = 0, timer, items = 0, page = 1, firstAPI = false;

        const createListItem = (() => {
            const list = document.createElement('li'), outer_div = document.createElement('div'),
                text_div = document.createElement('div'), number_div = document.createElement('div');
            text_div.classList.add('text-div');
            number_div.classList.add('number-div');
            outer_div.append(text_div, number_div);
            list.appendChild(outer_div);

            return (query, aliased_tag, name, count) => {
                number_div.textContent = simplifyNumber(count);
                const newList = list.cloneNode(true),
                    new_text_div = newList.firstChild.firstChild,
                    strong = document.createElement('strong'), match = name.match(query);
                if (match) {
                    const index = match.index, endIndex = index + match[0].length;
                    strong.textContent = name.substring(index, endIndex);
                    new_text_div.append(document.createTextNode(name.substring(0, index)), strong, document.createTextNode(name.substring(endIndex)));
                }
                else new_text_div.appendChild(document.createTextNode(name));
                if (aliased_tag) {
                    // .replaceAll('-colon-', ':').replaceAll('+', ' '), will cause issues however
                    new_text_div.appendChild(document.createTextNode(` → ${aliased_tag}`));
                    newList.dataset.name = aliased_tag;
                } else newList.dataset.name = name;
                return newList;
            }
        })();

        function displayAutocompleteResults(newQuery, data) {
            if (newQuery) {
                closeList(false);
                document.addEventListener('click', closeList, {once: true});
                ac_list.dataset.query = JSON.stringify(currentQuery);
            }
            if (data?.length > 0) {
                receivedPage = true;
                ac_list.classList.remove('hidden');
                const curr = currentQuery.regex;
                for (const i of data) ac_list.appendChild(createListItem(curr, i['aliased_tag'], i['name'], i['images']));
                if (!ac_list.querySelector('.ac-active')) {
                    ac_list.firstElementChild.classList.add('ac-active');
                    newQuery && ac_list.firstElementChild.scrollIntoView({behavior: 'instant', block: 'center'});
                }
            }
            if (data?.length < 25) ac_list.dispatchEvent(scrollEvent);
        }

        async function getResults(newQuery) {
            receivedPage = false;
            const curr = currentQuery.current, specials = [];
            if (newQuery) {
                localOver = false;
                page = 1;
                items = 0;
                if (Settings.preferences.special_searches) {
                    for (const [special, type] of special_searches) if (special.startsWith(curr)) {
                        specials.push({aliased_tag: null, name: special + ":", images: -1});
                        if (type === 1) for (const modifier of range_modifiers) {
                            specials.push({aliased_tag: null, name: `${special}${modifier}:`, images: -1});
                        }
                    }
                }
            } else ++page;
            if (!localOver) {
                const localResults = await fetchfunc(curr, page, controller);
                items += localResults.length;
                // fallback to api if not fully local and api fallback enabled
                if (localResults.length < 25) {
                    localOver = true;
                    firstAPI = true;
                    receivedPage = true;
                    page = Math.floor(items / 25); // no + 1 as it's handled by the above else case
                }
                displayAutocompleteResults(newQuery, specials.concat(localResults));
            } else if (!Settings.preferences.local_autocomplete_enabled && Settings.preferences.api_fallback) {
                clearTimeout(timer);
                const f = async () => {
                    let apiResults = await apifetchfunc(curr, page, controller);
                    if (firstAPI) {
                        firstAPI = false;
                        if (apiResults?.length > 0) {
                            const lastElem = ac_list?.lastElementChild,
                                lastText = lastElem?.querySelector('.text-div')?.textContent?.split(' →')?.[0],
                                lastCount = +lastElem?.querySelector('.number-div').textContent;

                            let pageCopy = page, extras = 2;
                            while (apiResults[0]?.images <= lastCount && pageCopy > 1 && extras-- > 0) {
                                apiResults = (await apifetchfunc(curr, --pageCopy, controller)).concat(apiResults);
                            }
                            extras = 2;
                            let noneRemain = false;
                            while (apiResults[apiResults.length - 1]?.images >= lastCount && extras-- > 0) {
                                const r = await apifetchfunc(curr, ++page, controller);
                                if (r?.length <= 0) {
                                    noneRemain = true;
                                    break;
                                }
                                apiResults = apiResults.concat(r);
                            }

                            for (let i = 0; i < apiResults.length; ++i) if (apiResults[i].name === lastText) {
                                apiResults.splice(0, i + 1);
                                break;
                            }
                            if (apiResults.length === 0 && !noneRemain) {
                                apiResults = await apifetchfunc(curr, ++pageCopy, controller);
                                ++page;
                            }
                        }
                    }
                    displayAutocompleteResults(newQuery, apiResults);
                    lastApiCall = performance.now();
                };
                if ((performance.now() - lastApiCall) > API_TIMEOUT) f();
                else timer = setTimeout(f, API_TIMEOUT);
            }
        }

        input.addEventListener('focus', () => {
            chrome.runtime.sendMessage({type: 'local_autocomplete_load', local: Settings.preferences.local_autocomplete_enabled});
        });
        input.addEventListener('input', newSearch);
        input.addEventListener('pointerup', newSearch);

        function newSearch() {
            input.autocomplete = 'off';
            const newQuery = cleanQuery(input.value, input.selectionStart);
            if (newQuery.current !== currentQuery?.current) {
                clearTimeout(timer);
                if (!controller.signal.aborted) controller.abort();
                controller = new AbortController();
                currentQuery = newQuery;
                if (currentQuery.current.length <= 0) closeList();
                else getResults(true);
            }
        }

        input.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing list

        { // Mapping Keys to their functions
            const keyMappings = {
                'ArrowDown' : () => changeActive(true),
                'ArrowUp' : () => changeActive(false),
                'Tab' : () => ac_list.querySelector('.ac-active').click()
            };

            input.addEventListener('keydown', (e) => {
                const action = keyMappings[e.key];
                if (action) {
                    e.preventDefault();
                    action();
                }
            });

            function changeActive(down) {
                const oldItem = ac_list.querySelector('.ac-active');
                oldItem.classList.remove('ac-active');

                const newItem = down ? oldItem.nextElementSibling ?? ac_list.firstElementChild
                    : oldItem.previousElementSibling ?? ac_list.lastElementChild;
                newItem.classList.add('ac-active');
                newItem.scrollIntoView({block: 'center'});
            }
        }

        function closeList(full = true) {
            document.removeEventListener('click', closeList);
            clearTimeout(timer);
            if (full) currentQuery = null;
            ac_list.classList.add('hidden');
            const newList = ac_list.cloneNode();
            ac_list.parentNode.replaceChild(newList, ac_list);
            ac_list = newList;
            { // scroll stuff
                let lastScrollTop = 0;
                ac_list.addEventListener('scroll', () => {
                    if (ac_list.scrollTop < lastScrollTop) return;
                    lastScrollTop = ac_list.scrollTop <= 0 ? 0 : ac_list.scrollTop;
                    if (receivedPage && ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight - 432) getResults(false);
                }, {signal: controller.signal});
            }
            { // input stuff
                ac_list.addEventListener('click', (e) => {
                    e.stopPropagation();
                    e.stopImmediatePropagation();

                    const selected = e.target.closest("li");
                    if (selected) {
                        const {parts, splitters, i, ignoredPrefix, uncleaned, lengthCounter} = JSON.parse(ac_list.dataset.query);
                        parts[i] = parts[i].replace(uncleaned, selected.dataset.name);
                        input.value = "";
                        for (let i = 0; i < parts.length; ++i) input.value += parts[i] + (splitters?.[i] ?? '');
                        input.setSelectionRange(lengthCounter + parts[i].length, lengthCounter + parts[i].length);

                        input.focus();
                        closeList();
                    }
                });
            }
        }
    }

    {
        const searchOperators = [',', ' AND ', ' OR ', ' \\|\\| ', ' && '],
            regex = new RegExp(searchOperators.join('|'), 'g'), ignored = ['-', '!', 'NOT ', '('];

        cleanQuery = (query, position) => {
            const parts = query.split(regex);
            const splitters = query.match(regex);

            let lengthCounter = 0, i = 0;
            for (const part of parts) {
                if (lengthCounter <= position && position <= lengthCounter + part.length) {
                    query = part.trimStart();
                    break;
                }
                lengthCounter += part.length + (splitters?.[i]?.length ?? 0);
                ++i;
            }

            let ignoredPrefix = '';
            if (query.length > 0) {
                for (const op of ignored) if (query.startsWith(op)) {
                    ignoredPrefix = op;
                    query = query.substring(op.length);
                    break;
                }
            }
            const current = query.trimStart().toLowerCase();
            return {current, parts, splitters, i, ignoredPrefix, lengthCounter, uncleaned: query.trimStart(), regex: getRegex(current)};
        };
    }

    function simplifyNumber(number) {
        if (number === -2) return 'error';
        else if (number === -1) return 'special';
        else if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    fetchfunc = (query, page, controller) => new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({type: 'local_autocomplete_load', local: Settings.preferences.local_autocomplete_enabled}).then((r) => {
            if (r) {
                chrome.runtime.sendMessage({
                    type: 'local_autocomplete_complete', query, newQuery: page === 1,
                    match_start: Settings.preferences.match_start
                }).then((r) => {
                    if (controller.signal.aborted) reject('Autocomplete Cancelled');
                    else resolve(r);
                });
            } else reject('Autocomplete loading, please wait.');
        });
    });


    apifetchfunc = async (query, page, controller) => {
        console.log(`Making API Request for "${query}" with page ${page}`);
        return (await (await fetch(`https://derpibooru.org/api/v1/json/search/tags?q=${Settings.preferences.match_start ? '' : '*'}${encodeURIComponent(query)}*&page=${page}`,
            {method: "GET", signal: controller.signal})).json())['tags'];
    }

    const updateListLengths = () => {
        const v = Number(Settings.preferences.results_visible);
        for (const list of document.querySelectorAll('.ac-list')) list.style.setProperty('--count', v);
    }

    Settings.loadSettings().then(() => {
        const inputs = [document.getElementById('q'), document.getElementById('searchform_q')];
        for (const input of inputs) {
            if (input != null) {
                const form = input.parentElement, div = document.createElement('div'),
                    ac_list = document.createElement('div');
                if (form) {
                    div.classList.add('ac', ...form.classList);
                    form.before(div);
                    div.appendChild(form);

                    input.removeAttribute('data-autocomplete');
                    input.autocomplete = 'off';

                    ac_list.classList.add('ac-list', 'hidden');
                    input.parentNode.parentNode.appendChild(ac_list);

                    autocomplete(input, ac_list);
                }
            }
        }
        updateListLengths();
    });

    chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.hasOwnProperty('preferences')) Settings.loadSettings().then(updateListLengths);
        }
    });
})();