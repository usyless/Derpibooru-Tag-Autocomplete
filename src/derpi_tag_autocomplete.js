(() => {
    'use strict';

    // set browser to chrome if not in firefox
    /** @type {typeof browser} */
    const extension = typeof browser !== 'undefined' ? browser : (() => {
        return chrome;
    })();

    // 20 requests per 10 seconds
    const API_TIMEOUT = 400;
    const API_TIMEOUT_SCROLLING = 100;

    const scrollEvent = new Event('scroll');
    let fetchfunc, cleanQuery, apifetchfunc;

    const literal_property = 0;
    const ranged_property = 1;
    const boolean_property = ['true', 'false'];
    const my_namespace = ['comments', 'faves', 'uploads', 'upvotes', 'watched'];

    const special_searches = [
        ["animated", boolean_property], ["aspect_ratio", ranged_property], ["body_type_tag_count", ranged_property],
        ["character_tag_count", ranged_property], ["comment_count", ranged_property],
        ["content_fanmade_tag_count", ranged_property], ["content_official_tag_count", ranged_property],
        ["created_at", ranged_property], ["description", literal_property], ["downvotes", ranged_property],
        ["duplicate_id", ranged_property], ["duration", ranged_property], ["faved_by", literal_property],
        ["faves", ranged_property], ["file_name", literal_property], ["first_seen_at", ranged_property],
        ["gallery_id", literal_property], ["height", ranged_property], ["id", ranged_property],
        ["mime_type", literal_property], ["my", my_namespace], ["oc_tag_count", ranged_property],
        ["orig_sha512_hash", literal_property], ["orig_size", ranged_property], ["original_format", literal_property],
        ["pixels", ranged_property], ["processed", boolean_property], ["rating_tag_count", ranged_property],
        ["score", ranged_property], ["sha512_hash", literal_property], ["size", ranged_property],
        ["source_count", ranged_property], ["source_url", literal_property], ["species_tag_count", ranged_property],
        ["spoiler_tag_count", ranged_property], ["tag_count", ranged_property],
        ["thumbnails_generated", boolean_property], ["updated_at", ranged_property], ["uploader", literal_property],
        ['uploader_id', ranged_property], ["upvotes", ranged_property], ["width", ranged_property],
        ["wilson_score", ranged_property],
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

        loadSettings: async () => {
            const s = await extension.storage.local.get(['preferences']);
            for (const setting of ['preferences']) Settings[setting] = {...Settings[setting], ...s[setting]};
        },
    }

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

    const autocomplete = (input, ac_list) => {
        let receivedPage = true,
            localOver = false,
            currentQuery,
            specialMatch = false,
            controller = new AbortController(),
            timer,
            items = 0,
            page = 1,
            firstAPI = false;

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
                for (const {aliased_tag, name, images} of data) ac_list.appendChild(createListItem(curr, aliased_tag, name, images));
                if (!ac_list.querySelector('.ac-active')) {
                    ac_list.firstElementChild.classList.add('ac-active');
                    newQuery && ac_list.firstElementChild.scrollIntoView({behavior: 'instant', block: 'center'});
                }
            }
            if (data?.length < 25) ac_list.dispatchEvent(scrollEvent);
        }

        async function getResults(newQuery, scrolling) {
            receivedPage = false;
            const curr = currentQuery.current;
            const specials = [];

            if (newQuery) {
                localOver = false;
                specialMatch = false;
                page = 1;
                items = 0;
                if (Settings.preferences.special_searches) {
                    const /** @type {string[]} */ currParts = curr.split(':');
                    const currSpecialWithModifier = currParts.shift().split('.');
                    const currSpecialPart = currSpecialWithModifier.shift();
                    const currModifierPart = currSpecialWithModifier.join('.');
                    const currValuePart = currParts.join(':');
                    const hasStartedTypingModifier = currSpecialWithModifier.length > 0;

                    for (const [special, type] of special_searches) if (special.startsWith(currSpecialPart)) {
                        if (Array.isArray(type)) {
                            for (const value of type) if (value.startsWith(currValuePart)) {
                                specials.push({name: `${special}:${value}`, images: -1});
                            }
                            continue;
                        }

                        // Only add the property without modifier if user haven't typed it yet.
                        if (!hasStartedTypingModifier) {
                            specials.push({name: `${special}:${currValuePart}`, images: -1})
                        }

                        if (type === ranged_property) {
                            for (const modifier of range_modifiers) {
                                // Display all if modifier isn't typed yet or match the modifier to the one user have typed.
                                if (hasStartedTypingModifier && !modifier.startsWith(`.${currModifierPart}`)) continue;

                                specials.push({name: `${special}${modifier}:${currValuePart}`,images: -1});
                            }
                        }
                    }

                    specialMatch = (specials.length > 0) && curr.includes(':');
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
            } else if (!specialMatch && !Settings.preferences.local_autocomplete_enabled && Settings.preferences.api_fallback) {
                clearTimeout(timer);
                timer = setTimeout(async () => {
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
                }, (scrolling ? API_TIMEOUT_SCROLLING : API_TIMEOUT));
            }
        }

        input.addEventListener('focus', () =>
            extension.runtime.sendMessage({type: 'local_autocomplete_load', local: Settings.preferences.local_autocomplete_enabled}));
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
                else void getResults(true);
            }
        }

        input.addEventListener('click', (e) => e.stopPropagation()); // Prevent closing list

        { // Mapping Keys to their functions
            const keyMappings = {
                'ArrowDown' : () => changeActive(true),
                'ArrowUp' : () => changeActive(false),
                'Tab' : () => ac_list.querySelector('.ac-active')?.click()
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
                    if (receivedPage && ac_list.scrollTop + ac_list.offsetHeight >= ac_list.scrollHeight - 432) void getResults(false, true);
                }, {signal: controller.signal});
            }
        }

        ac_list.parentElement.addEventListener('click', (e) => {
            if (e.target.closest(".ac-list:not(.hidden)")) {
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
            }
        });
    }

    cleanQuery = (() => {
        const searchOperators = [',', ' AND ', ' OR ', ' \\|\\| ', ' && '],
            regex = new RegExp(searchOperators.join('|'), 'g'), ignored = ['-', '!', 'NOT ', '('];

        return (query, position) => {
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
    })();

    function simplifyNumber(number) {
        if (number === -2) return 'error';
        else if (number === -1) return 'special';
        else if (number < 1000) return number.toString();
        else if (number < 1000000) return `${(number / 1000).toFixed(1)}K`;
        else return `${(number / 1000000).toFixed(1)}M`;
    }

    fetchfunc = (query, page, controller) => new Promise((resolve, reject) => {
        extension.runtime.sendMessage({type: 'local_autocomplete_load', local: Settings.preferences.local_autocomplete_enabled}).then((r) => {
            if (r) {
                extension.runtime.sendMessage({
                    type: 'local_autocomplete_complete', query, newQuery: page === 1,
                    match_start: Settings.preferences.match_start
                }).then((r) => {
                    if (controller.signal.aborted) reject('Autocomplete Cancelled');
                    else resolve(r);
                });
            } else reject('Autocomplete loading, please wait.');
        });
    });

    apifetchfunc = (() => {
        const /** @type {(string) => string} */ fixApiFetchQuery = (q) =>
            q.replaceAll('(', '\\(')
            .replaceAll(')', '\\)');

        const rate_limit_key = 'api_rate_limited_until';

        // 20 requests per 10 seconds
        let request_count = 0;
        let request_count_reset_time = 0;

        const makeRequest = async (query, page, controller) => {
            console.log(`Making API Request for "${query}" with page ${page}`);
            const r = await fetch(
                `https://derpibooru.org/api/v1/json/search/tags?q=${Settings.preferences.match_start ? '' : '*'}${encodeURIComponent(query)}*&page=${page}`,
                {method: "GET", signal: controller.signal}
            );

            if (!r.ok) {
                console.log(`API Request failed for "${query}"`);

                if ((r.status === 501 && (r.headers.get("Content-Type") === 'text/html'))) {
                    // 5 second rate limit
                    await extension.storage.local.set({[rate_limit_key]: Date.now() + (6 * 1000)});
                    return apifetchfunc(query, page, controller);
                } else if (r.status === 500 && ((await r.text()).length <= 0)) {
                    // 15 minute rate limit
                    await extension.storage.local.set({[rate_limit_key]: Date.now() + (16 * 60 * 1000)});
                    return apifetchfunc(query, page, controller);
                } else if (r.status === 429) {
                    await extension.storage.local.set({[rate_limit_key]: Date.now() + (1000)});
                    return apifetchfunc(query, page, controller);
                }

                throw new Error(`Response not okay with status: ${r.status}`);
            }

            return (await r.json()).tags;
        }

        return async (query, page, controller) => {
            const currentTime = Date.now();

            if (currentTime > request_count_reset_time) {
                request_count_reset_time = currentTime + (10 * 1000);
                request_count = 0;
            }

            query = fixApiFetchQuery(query);

            let limitedUntil = (await extension.storage.local.get(rate_limit_key))[rate_limit_key] ?? 0;
            if (typeof limitedUntil !== 'number' || limitedUntil > (currentTime + (17 * 60 * 1000))) {
                limitedUntil = 0;
                await extension.storage.local.set({[rate_limit_key]: limitedUntil});
            }

            if ((++request_count > 20) && (request_count_reset_time > limitedUntil)) {
                console.log(`Waiting ${(request_count_reset_time - currentTime) / 1000}s before making request for "${query}"`);
                await new Promise(resolve => setTimeout(resolve, request_count_reset_time - currentTime));
            } else if (limitedUntil > currentTime) {
                // if controller is cancelled then it'll just throw when making a request
                console.log(`Waiting ${(limitedUntil - currentTime) / 1000}s before making request for "${query}"`);
                await new Promise(resolve => setTimeout(resolve, limitedUntil - currentTime));
            }

            return makeRequest(query, page, controller);
        }
    })();

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

    extension.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'local') {
            if (changes.hasOwnProperty('preferences')) Settings.loadSettings().then(updateListLengths);
        }
    });
})();